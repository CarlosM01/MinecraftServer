const Docker = require("dockerode");

/**
 * Singleton service wrapping a dockerode instance for container
 * stats, info, and log streaming.
 */
class DockerService {
  constructor() {
    const socketPath =
      process.env.DOCKER_SOCKET_PATH || "/var/run/docker.sock";
    this.docker = new Docker({ socketPath });
    this.containerName =
      process.env.MINECRAFT_CONTAINER_NAME || "minecraft-server";
    this.allocatedMemoryMb = this._parseMemoryEnv(
      process.env.MINECRAFT_MEMORY || "4G"
    );
  }

  /* ── Container resolution ─────────────────────────────────── */

  /**
   * Resolve a container by explicit ID/name or fall back to the
   * configured MINECRAFT_CONTAINER_NAME env var.
   * @param {string} [id] - Optional container ID or name override.
   * @returns {import("dockerode").Container}
   */
  getContainer(id) {
    return this.docker.getContainer(id || this.containerName);
  }

  /* ── One-shot stats snapshot ──────────────────────────────── */

  /**
   * Fetch a single stats snapshot and the container uptime.
   * @returns {Promise<{cpu_percent: number, ram_used_mb: number, ram_limit_mb: number, ram_percent: number, uptime_ms: number}>}
   */
  async getStats() {
    const container = this.getContainer();

    // Grab stats (one-shot, stream: false) and inspect in parallel
    const [stats, inspectData] = await Promise.all([
      container.stats({ stream: false }),
      container.inspect(),
    ]);

    return {
      ...this._formatStats(stats),
      uptime_ms: this._calcUptime(inspectData.State.StartedAt),
    };
  }

  /* ── Continuous stats stream ──────────────────────────────── */

  /**
   * Open a streaming stats connection.  Calls `onData` with formatted
   * stats roughly every 2 s (Docker default cadence).
   *
   * @param {(data: object) => void} onData
   * @param {(err: Error) => void}   onError
   * @returns {Promise<() => void>}  Cleanup function that destroys the stream.
   */
  async streamStats(onData, onError) {
    const container = this.getContainer();

    // We need the StartedAt once for uptime — grab it before the stream
    const inspectData = await container.inspect();
    const startedAt = inspectData.State.StartedAt;

    const stream = await container.stats({ stream: true });

    stream.on("data", (chunk) => {
      try {
        const stats = JSON.parse(chunk.toString());
        onData({
          ...this._formatStats(stats),
          uptime_ms: this._calcUptime(startedAt),
        });
      } catch (err) {
        onError(err);
      }
    });

    stream.on("error", onError);

    // Return a destroy function so the caller can tear down cleanly
    return () => {
      stream.removeAllListeners();
      stream.destroy();
    };
  }

  /* ── Log stream ───────────────────────────────────────────── */

  /**
   * Follow container logs. Demuxes stdout/stderr and calls `onData`
   * for each line with `{ timestamp, source, message }`.
   *
   * @param {(data: {timestamp: string, source: string, message: string}) => void} onData
   * @param {(err: Error) => void} onError
   * @param {number} [tail=100] - Number of historical lines to return.
   * @returns {Promise<() => void>} Cleanup function that destroys the stream.
   */
  async streamLogs(onData, onError, tail = 100) {
    const container = this.getContainer();

    const stream = await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
      tail,
      timestamps: true,
    });

    // dockerode returns a raw multiplexed stream.
    // We demux it into two PassThrough streams (stdout / stderr).
    const { PassThrough } = require("stream");
    const stdoutStream = new PassThrough();
    const stderrStream = new PassThrough();

    container.modem.demuxStream(stream, stdoutStream, stderrStream);

    const handleLine = (source) => (chunk) => {
      const raw = chunk.toString();
      // Each line may contain multiple newline-separated entries
      raw.split("\n").forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        onData(this._parseLogLine(trimmed, source));
      });
    };

    stdoutStream.on("data", handleLine("stdout"));
    stderrStream.on("data", handleLine("stderr"));

    stream.on("error", onError);

    return () => {
      stream.removeAllListeners();
      stdoutStream.removeAllListeners();
      stderrStream.removeAllListeners();
      stream.destroy();
      stdoutStream.destroy();
      stderrStream.destroy();
    };
  }

  /* ── Container info (lightweight) ─────────────────────────── */

  /**
   * Return a small info payload about the container.
   * @returns {Promise<{name: string, status: string, image: string, startedAt: string}>}
   */
  async getInfo() {
    const container = this.getContainer();
    const data = await container.inspect();

    return {
      name: data.Name.replace(/^\//, ""),
      status: data.State.Status,
      image: data.Config.Image,
      startedAt: data.State.StartedAt,
    };
  }

  /* ── Private helpers ──────────────────────────────────────── */

  /**
   * Calculate CPU % from a Docker stats payload using the delta method.
   * Formula: (cpuDelta / systemDelta) * numCpus * 100
   */
  _formatStats(stats) {
    const cpuDelta =
      stats.cpu_stats.cpu_usage.total_usage -
      stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta =
      stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;

    const numCpus =
      stats.cpu_stats.online_cpus ||
      (stats.cpu_stats.cpu_usage.percpu_usage
        ? stats.cpu_stats.cpu_usage.percpu_usage.length
        : 1);

    const cpuPercent =
      systemDelta > 0
        ? parseFloat(((cpuDelta / systemDelta) * numCpus * 100).toFixed(2))
        : 0;

    const ramUsedBytes =
      stats.memory_stats.usage - (stats.memory_stats.stats?.cache || 0);
    const ramUsedMb = parseFloat((ramUsedBytes / 1024 / 1024).toFixed(1));
    const ramLimitMb = this.allocatedMemoryMb;

    return {
      cpu_percent: cpuPercent,
      ram_used_mb: ramUsedMb,
      ram_limit_mb: ramLimitMb,
      ram_percent: parseFloat(
        ((ramUsedMb / ramLimitMb) * 100).toFixed(1)
      ),
    };
  }

  /**
   * Derive uptime in milliseconds from a container's StartedAt ISO string.
   */
  _calcUptime(startedAt) {
    return Date.now() - new Date(startedAt).getTime();
  }

  /**
   * Parse a Docker log line (with timestamps enabled) into a structured object.
   * Docker timestamp format: `2026-05-01T10:00:00.123456789Z <message>`
   */
  _parseLogLine(line, source) {
    // Timestamps are the first space-separated token
    const spaceIdx = line.indexOf(" ");
    if (spaceIdx === -1) {
      return { timestamp: new Date().toISOString(), source, message: line };
    }
    return {
      timestamp: line.slice(0, spaceIdx),
      source,
      message: line.slice(spaceIdx + 1),
    };
  }

  /**
   * Parse a memory string like "4G", "8G", "2048M" into megabytes.
   * Falls back to 4096 MB if the format is unrecognised.
   */
  _parseMemoryEnv(memStr) {
    const match = memStr.trim().match(/^(\d+(?:\.\d+)?)\s*([gGmM])?$/);
    if (!match) return 4096;
    const value = parseFloat(match[1]);
    const unit = (match[2] || "M").toUpperCase();
    return unit === "G" ? value * 1024 : value;
  }
}

// ── Singleton export ──────────────────────────────────────────
module.exports = new DockerService();
