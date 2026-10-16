const { PassThrough } = require("stream");
const Docker = require("dockerode");
const config = require("../config");

/**
 * Thin wrapper around dockerode with the container operations the panel
 * needs. Every method takes the container name explicitly.
 */
class DockerService {
  constructor() {
    this.docker = new Docker({ socketPath: config.dockerSocketPath });
  }

  getContainer(name) {
    return this.docker.getContainer(name);
  }

  /** Inspect a container, returning null when it does not exist. */
  async inspect(name) {
    try {
      return await this.getContainer(name).inspect();
    } catch (err) {
      if (err.statusCode === 404) return null;
      throw err;
    }
  }

  /* ── Images ───────────────────────────────────────────────── */

  async hasImage(image) {
    try {
      await this.docker.getImage(image).inspect();
      return true;
    } catch (err) {
      if (err.statusCode === 404) return false;
      throw err;
    }
  }

  /**
   * Pull an image if it is not present locally.
   * @param {string} image
   * @param {(msg: string) => void} [onProgress]
   */
  async ensureImage(image, onProgress = () => {}) {
    if (await this.hasImage(image)) return;
    onProgress(`Descargando imagen ${image}…`);
    const stream = await this.docker.pull(image);
    await new Promise((resolve, reject) => {
      let last = 0;
      this.docker.modem.followProgress(
        stream,
        (err) => (err ? reject(err) : resolve()),
        (evt) => {
          // Throttle progress messages to one every 2 s
          if (Date.now() - last > 2000 && evt.status) {
            last = Date.now();
            onProgress(`${evt.status}${evt.progress ? " " + evt.progress : ""}`);
          }
        }
      );
    });
    onProgress(`Imagen ${image} lista.`);
  }

  /* ── Stats ────────────────────────────────────────────────── */

  /**
   * Open a streaming stats connection (~1 sample/s from Docker).
   * @returns {Promise<() => void>} destroy function
   */
  async streamStats(name, onData, onError) {
    const stream = await this.getContainer(name).stats({ stream: true });
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk.toString();
      let idx;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        try {
          onData(this.formatStats(JSON.parse(line)));
        } catch (err) {
          onError(err);
        }
      }
    });
    stream.on("error", onError);
    return () => {
      stream.removeAllListeners();
      stream.destroy();
    };
  }

  /**
   * CPU % via the delta method: (cpuDelta / systemDelta) * numCpus * 100.
   * RAM excludes page cache (inactive_file on cgroup v2, cache on v1).
   */
  formatStats(stats) {
    const cpu = stats.cpu_stats || {};
    const pre = stats.precpu_stats || {};
    const cpuDelta = (cpu.cpu_usage?.total_usage || 0) - (pre.cpu_usage?.total_usage || 0);
    const systemDelta = (cpu.system_cpu_usage || 0) - (pre.system_cpu_usage || 0);
    const numCpus = cpu.online_cpus || cpu.cpu_usage?.percpu_usage?.length || 1;
    const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * numCpus * 100 : 0;

    const mem = stats.memory_stats || {};
    const cache = mem.stats?.inactive_file ?? mem.stats?.cache ?? 0;
    const usedMb = Math.max(0, (mem.usage || 0) - cache) / 1024 / 1024;
    const limitMb = (mem.limit || 0) / 1024 / 1024;

    return {
      cpu_percent: round(cpuPercent, 2),
      ram_used_mb: round(usedMb, 1),
      ram_limit_mb: round(limitMb, 1),
      ram_percent: limitMb > 0 ? round((usedMb / limitMb) * 100, 1) : 0,
    };
  }

  /* ── Console ──────────────────────────────────────────────── */

  /**
   * Last `tail` lines of output. Panel containers use a TTY, so the log
   * stream is raw (not multiplexed) and keeps the ANSI colours.
   */
  async logsTail(name, tail = 500) {
    const container = this.getContainer(name);
    const info = await container.inspect();
    const buf = await container.logs({ stdout: true, stderr: true, tail, follow: false });
    if (info.Config.Tty) return buf.toString("utf8");
    return demuxBuffer(buf);
  }

  /**
   * Attach to the container's stdin/stdout (equivalent to `docker attach`).
   * The returned duplex stream receives console output and accepts input.
   */
  async attach(name) {
    return this.getContainer(name).attach({
      stream: true,
      stdin: true,
      stdout: true,
      stderr: true,
      hijack: true,
    });
  }

  /**
   * Run a command inside the container and collect its output.
   * @returns {Promise<{output: string, exitCode: number}>}
   */
  async exec(name, cmd, { timeoutMs = 15000 } = {}) {
    const container = this.getContainer(name);
    const exec = await container.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
    });
    const stream = await exec.start({ hijack: true, stdin: false });
    const out = new PassThrough();
    let output = "";
    out.on("data", (c) => (output += c.toString("utf8")));
    container.modem.demuxStream(stream, out, out);

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        stream.destroy();
        reject(new Error(`Timeout ejecutando '${cmd.join(" ")}'`));
      }, timeoutMs);
      stream.on("end", () => {
        clearTimeout(timer);
        resolve();
      });
      stream.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
    const { ExitCode } = await exec.inspect();
    return { output, exitCode: ExitCode ?? 0 };
  }

  /* ── Events ───────────────────────────────────────────────── */

  /**
   * Subscribe to container events for panel-managed containers.
   * Reconnects automatically if the event stream drops.
   */
  async watchEvents(onEvent) {
    const connect = async () => {
      try {
        const stream = await this.docker.getEvents({
          filters: { type: ["container"], label: ["mc-panel.server"] },
        });
        let buffer = "";
        stream.on("data", (chunk) => {
          buffer += chunk.toString();
          let idx;
          while ((idx = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 1);
            if (!line) continue;
            try {
              onEvent(JSON.parse(line));
            } catch (err) {
              console.error("[docker events] Bad payload:", err.message);
            }
          }
        });
        const retry = () => {
          stream.removeAllListeners();
          setTimeout(connect, 3000);
        };
        stream.on("end", retry);
        stream.on("error", retry);
      } catch (err) {
        console.error("[docker events] Cannot subscribe:", err.message);
        setTimeout(connect, 5000);
      }
    };
    await connect();
  }

  /** All host ports currently published by any container. */
  async publishedPorts() {
    const containers = await this.docker.listContainers({ all: true });
    const ports = new Set();
    for (const c of containers) {
      for (const p of c.Ports || []) if (p.PublicPort) ports.add(p.PublicPort);
    }
    // Stopped containers do not list Ports; look at their HostConfig instead
    for (const c of containers.filter((x) => x.State !== "running")) {
      try {
        const info = await this.getContainer(c.Id).inspect();
        for (const bindings of Object.values(info.HostConfig.PortBindings || {})) {
          for (const b of bindings || []) if (b.HostPort) ports.add(parseInt(b.HostPort, 10));
        }
      } catch {
        /* container vanished meanwhile */
      }
    }
    return ports;
  }
}

function round(n, digits) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** Decode a multiplexed (non-TTY) log buffer into plain text. */
function demuxBuffer(buf) {
  let out = "";
  let offset = 0;
  while (offset + 8 <= buf.length) {
    const size = buf.readUInt32BE(offset + 4);
    out += buf.slice(offset + 8, offset + 8 + size).toString("utf8");
    offset += 8 + size;
  }
  return out;
}

module.exports = new DockerService();
