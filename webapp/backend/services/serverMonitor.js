const EventEmitter = require("events");
const realtime = require("../realtime");
const dockerService = require("./dockerService");
const { cleanLine } = require("../lib/text");
const { parseConsoleLine } = require("../lib/parsers");

const CRASH_WINDOW_MS = 10 * 60 * 1000;
const CRASH_THRESHOLD = 3;
const STATS_EMIT_MS = 2000;
const SUMMARY_EMIT_MS = 3000;

/**
 * Keeps one live runtime per running server:
 *  - a `docker attach` connection (console output + stdin) shared by every
 *    terminal client and by the console-line parsers (players, Chunky…)
 *  - a Docker stats stream (latest sample kept in memory)
 * and tracks status transitions from Docker events.
 *
 * Emits: "line" (serverId, cleanLine, parsedEvent|null), "status" (serverId, state)
 */
class ServerMonitor extends EventEmitter {
  constructor() {
    super();
    this.runtimes = new Map(); // id -> runtime (see _blankState)
    this.expectedStops = new Map(); // id -> deadline ms
    this.crashTimes = new Map(); // id -> [ms]
    this.crashloop = new Set();
  }

  _serverService() {
    return require("./serverService");
  }

  _blankState() {
    return {
      container: false,
      dockerStatus: "missing",
      ready: false,
      health: null,
      startedAt: null,
      exitCode: null,
      stats: null,
      attach: null,
      destroyStats: null,
      partial: "",
      lastStatsEmit: 0,
    };
  }

  _rt(id) {
    id = Number(id);
    if (!this.runtimes.has(id)) this.runtimes.set(id, this._blankState());
    return this.runtimes.get(id);
  }

  /* ── Public state ─────────────────────────────────────────── */

  status(rt, id) {
    if (this.crashloop.has(Number(id))) return "crashloop";
    if (!rt.container) return "missing";
    if (rt.dockerStatus === "running") return rt.ready ? "online" : "starting";
    if (rt.dockerStatus === "restarting") return "restarting";
    return "stopped";
  }

  getState(id) {
    const rt = this._rt(id);
    return {
      status: this.status(rt, id),
      dockerStatus: rt.dockerStatus,
      health: rt.health,
      startedAt: rt.startedAt,
      exitCode: rt.exitCode,
      stats: rt.stats,
      uptime_ms: rt.startedAt && rt.dockerStatus === "running" ? Date.now() - new Date(rt.startedAt).getTime() : 0,
    };
  }

  isOnline(id) {
    return this.getState(id).status === "online";
  }

  /* ── Boot ─────────────────────────────────────────────────── */

  async init() {
    for (const row of this._serverService().listRows()) {
      await this.refresh(row).catch((err) =>
        console.error(`[monitor] Cannot inspect ${row.container_name}:`, err.message)
      );
    }
    await dockerService.watchEvents((evt) => this._onEvent(evt));
    setInterval(() => this._emitSummary(), SUMMARY_EMIT_MS);
  }

  /** Re-read container state from Docker and (de)attach accordingly. */
  async refresh(row) {
    const rt = this._rt(row.id);
    const info = await dockerService.inspect(row.container_name);
    rt.container = Boolean(info);
    rt.dockerStatus = info ? info.State.Status : "missing";
    rt.health = info?.State?.Health?.Status || null;
    rt.startedAt = info?.State?.StartedAt || null;
    rt.exitCode = info?.State?.ExitCode ?? null;
    if (info?.State?.Running) {
      if (rt.health === "healthy") rt.ready = true;
      await this._attach(row);
      if (!rt.ready) this._probeReady(row);
    } else {
      this._detach(row.id);
    }
    this._emitStatus(row.id);
  }

  /* ── Docker events ────────────────────────────────────────── */

  async _onEvent(evt) {
    const id = Number(evt.Actor?.Attributes?.["mc-panel.server"]);
    if (!id) return;
    let row;
    try {
      row = this._serverService().getRow(id);
    } catch {
      return; // container of a deleted server
    }
    const action = evt.Action || evt.status || "";
    const rt = this._rt(id);

    if (action.startsWith("health_status")) {
      rt.health = action.split(":")[1]?.trim() || null;
      if (rt.health === "healthy") rt.ready = true;
      this._emitStatus(id);
      return;
    }

    switch (action) {
      case "create":
        rt.container = true;
        rt.dockerStatus = "created";
        break;
      case "start":
        rt.ready = false;
        await this.refresh(row).catch(() => {});
        return;
      case "die": {
        const exitCode = parseInt(evt.Actor.Attributes.exitCode, 10);
        rt.exitCode = Number.isNaN(exitCode) ? null : exitCode;
        rt.ready = false;
        rt.dockerStatus = "exited";
        this._detach(id);
        this.emit("stopped", id);
        this._checkCrash(row, rt.exitCode);
        break;
      }
      case "restart":
        break;
      case "destroy":
        this._detach(id);
        rt.container = false;
        rt.dockerStatus = "missing";
        break;
      default:
        return;
    }
    // Docker may have moved on (e.g. restart policy); re-sync shortly after
    setTimeout(() => this.refresh(row).catch(() => {}), 1500);
    this._emitStatus(id);
  }

  expectStop(id) {
    this.expectedStops.set(Number(id), Date.now() + 120000);
  }

  clearCrashloop(id) {
    this.crashloop.delete(Number(id));
    this.crashTimes.delete(Number(id));
  }

  forget(id) {
    this._detach(id);
    this.runtimes.delete(Number(id));
    this.clearCrashloop(id);
  }

  _checkCrash(row, exitCode) {
    const id = row.id;
    const expected = (this.expectedStops.get(id) || 0) > Date.now();
    if (expected) {
      this.expectedStops.delete(id);
      return;
    }
    if (exitCode === 0 || exitCode === 143) return; // clean stop / SIGTERM

    const now = Date.now();
    const times = (this.crashTimes.get(id) || []).filter((t) => now - t < CRASH_WINDOW_MS);
    times.push(now);
    this.crashTimes.set(id, times);
    realtime.emit(`server:${id}`, "server:crash", { serverId: id, exitCode, count: times.length });

    if (times.length >= CRASH_THRESHOLD) {
      this.crashloop.add(id);
      console.warn(`[monitor] ${row.container_name} crashed ${times.length}x in 10 min — stopping it.`);
      const container = dockerService.getContainer(row.container_name);
      container
        .update({ RestartPolicy: { Name: "no", MaximumRetryCount: 0 } })
        .then(() => container.stop({ t: 10 }))
        .catch(() => {})
        .finally(() => this._emitStatus(id));
    }
  }

  /* ── Runtime (attach + stats) ─────────────────────────────── */

  async _attach(row) {
    const rt = this._rt(row.id);
    if (!rt.attach) {
      try {
        const stream = await dockerService.attach(row.container_name);
        rt.attach = stream;
        rt.partial = "";
        stream.on("data", (chunk) => this._onOutput(row.id, chunk));
        const onClose = () => {
          if (rt.attach === stream) rt.attach = null;
        };
        stream.on("end", onClose);
        stream.on("close", onClose);
        stream.on("error", onClose);
      } catch (err) {
        console.error(`[monitor] attach ${row.container_name} failed:`, err.message);
      }
    }
    if (!rt.destroyStats) {
      try {
        rt.destroyStats = await dockerService.streamStats(
          row.container_name,
          (stats) => this._onStats(row.id, stats),
          () => {}
        );
      } catch (err) {
        console.error(`[monitor] stats ${row.container_name} failed:`, err.message);
      }
    }
  }

  _detach(id) {
    const rt = this.runtimes.get(Number(id));
    if (!rt) return;
    if (rt.attach) {
      rt.attach.removeAllListeners();
      rt.attach.destroy();
      rt.attach = null;
    }
    if (rt.destroyStats) {
      rt.destroyStats();
      rt.destroyStats = null;
    }
    rt.stats = null;
  }

  /** Server already running when the panel booted: ask RCON if it answers. */
  _probeReady(row) {
    const rcon = require("./rconService");
    const rt = this._rt(row.id);
    if (rt.probing) return;
    rt.probing = true;
    let tries = 0;
    const probe = async () => {
      if (rt.ready || rt.dockerStatus !== "running" || tries++ > 60) {
        rt.probing = false;
        return;
      }
      const out = await rcon.tryExec(row, "list");
      if (out !== null) {
        rt.ready = true;
        rt.probing = false;
        this._emitStatus(row.id);
      } else {
        setTimeout(probe, 5000);
      }
    };
    setTimeout(probe, 2000);
  }

  _onOutput(id, chunk) {
    const text = chunk.toString("utf8");
    realtime.emit(`terminal:${id}`, "terminal:output", { serverId: id, data: text });

    const rt = this._rt(id);
    const lines = (rt.partial + text).split("\n");
    rt.partial = lines.pop();
    if (rt.partial.length > 8192) rt.partial = "";
    for (const raw of lines) {
      const line = cleanLine(raw);
      if (!line) continue;
      const evt = parseConsoleLine(line);
      if (evt?.type === "done" && !rt.ready) {
        rt.ready = true;
        this._emitStatus(id);
      }
      this.emit("line", id, line, evt);
    }
  }

  _onStats(id, stats) {
    const rt = this._rt(id);
    rt.stats = stats;
    if (Date.now() - rt.lastStatsEmit >= STATS_EMIT_MS) {
      rt.lastStatsEmit = Date.now();
      realtime.emit(`server:${id}`, "stats", {
        serverId: id,
        ...stats,
        uptime_ms: rt.startedAt ? Date.now() - new Date(rt.startedAt).getTime() : 0,
      });
    }
  }

  /* ── Console input ────────────────────────────────────────── */

  /**
   * Write one command line to the server's stdin.
   * @returns {boolean} false when no console is attached.
   */
  write(id, line) {
    const rt = this.runtimes.get(Number(id));
    if (!rt?.attach) return false;
    rt.attach.write(`${line}\n`);
    return true;
  }

  /* ── Broadcasts ───────────────────────────────────────────── */

  _emitStatus(id) {
    const payload = { serverId: Number(id), ...this.getState(id) };
    realtime.emit("global", "server:status", payload);
    realtime.emit(`server:${id}`, "server:status", payload);
    this.emit("status", Number(id), payload);
  }

  _emitSummary() {
    if (!realtime.roomSize("global")) return;
    const players = require("./playerService");
    const summary = this._serverService()
      .listRows()
      .map((row) => {
        const s = this.getState(row.id);
        return {
          serverId: row.id,
          status: s.status,
          cpu: s.stats?.cpu_percent ?? null,
          ram_mb: s.stats?.ram_used_mb ?? null,
          ram_limit_mb: s.stats?.ram_limit_mb ?? null,
          uptime_ms: s.uptime_ms,
          players: players.onlineCount(row.id),
          max_players: players.maxPlayers(row.id),
        };
      });
    realtime.emit("global", "servers:summary", summary);
  }
}

module.exports = new ServerMonitor();
