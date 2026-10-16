const db = require("../db");
const monitor = require("./serverMonitor");
const rconService = require("./rconService");
const { parseTps } = require("../lib/parsers");

const SAMPLE_MS = 30000;
const TPS_EVERY = 2; // query TPS every 2nd sample (60 s)
const RETENTION_DAYS = 30;
const RANGES = { "1h": 3600, "24h": 86400, "7d": 7 * 86400, "30d": 30 * 86400 };
const POINTS = 240;

const insert = db.prepare(
  "INSERT INTO metrics (server_id, ts, cpu, ram_mb, players, tps, mspt) VALUES (?, ?, ?, ?, ?, ?, ?)"
);

/**
 * Samples CPU, RAM, players and TPS/MSPT every 30 s for online servers and
 * stores them in SQLite. Queries are bucketed to ~240 points per range.
 */
class MetricsService {
  constructor() {
    this.tick = 0;
    this.lastTps = new Map(); // serverId -> {tps, mspt, source}
  }

  init() {
    setInterval(() => this.sample().catch((e) => console.error("[metrics]", e.message)), SAMPLE_MS);
    setInterval(() => this.purge(), 3600 * 1000);
    this.purge();
  }

  async sample() {
    this.tick += 1;
    const serverService = require("./serverService");
    const players = require("./playerService");
    const ts = Math.floor(Date.now() / 1000);
    for (const row of serverService.listRows()) {
      const state = monitor.getState(row.id);
      if (state.status !== "online" || !state.stats) continue;
      if (this.tick % TPS_EVERY === 1 || !this.lastTps.has(row.id)) {
        this.lastTps.set(row.id, await this.queryTps(row));
      }
      const tps = this.lastTps.get(row.id) || {};
      insert.run(row.id, ts, state.stats.cpu_percent, state.stats.ram_used_mb, players.onlineCount(row.id), tps.tps ?? null, tps.mspt ?? null);
    }
  }

  /**
   * TPS source by platform: Paper/Purpur `tps` + `mspt`, otherwise spark if
   * installed, otherwise vanilla `tick query` (1.20.3+). Null if unavailable.
   */
  async queryTps(row) {
    const modService = require("./modService");
    const isPaper = ["PAPER", "PURPUR"].includes(row.type) || ["paper", "purpur"].includes(row.loader);
    if (isPaper) {
      const tpsOut = await rconService.tryExec(row, "tps");
      const msptOut = await rconService.tryExec(row, "mspt");
      const a = tpsOut ? parseTps("paper", tpsOut) : {};
      const b = msptOut ? parseTps("paper-mspt", msptOut) : {};
      if (a.tps != null) return { tps: a.tps, mspt: b.mspt ?? null, source: "paper" };
    }
    if (modService.hasJar(row, "spark")) {
      const out = await rconService.tryExec(row, "spark tps");
      const r = out ? parseTps("spark", out) : {};
      if (r.tps != null) return { ...r, source: "spark" };
    }
    const out = await rconService.tryExec(row, "tick query");
    const r = out ? parseTps("tick", out) : {};
    if (r.mspt != null) return { ...r, source: "tick" };
    return { tps: null, mspt: null, source: null };
  }

  latestTps(id) {
    return this.lastTps.get(Number(id)) || null;
  }

  query(serverId, range = "24h") {
    const seconds = RANGES[range] || RANGES["24h"];
    const bucket = Math.max(30, Math.floor(seconds / POINTS));
    const since = Math.floor(Date.now() / 1000) - seconds;
    const rows = db
      .prepare(`
        SELECT (ts / ?) * ? AS t, AVG(cpu) AS cpu, AVG(ram_mb) AS ram_mb, MAX(players) AS players,
               AVG(tps) AS tps, AVG(mspt) AS mspt
        FROM metrics WHERE server_id = ? AND ts >= ?
        GROUP BY t ORDER BY t`)
      .all(bucket, bucket, serverId, since);
    const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10);
    return {
      range,
      bucket,
      points: rows.map((r) => ({ t: r.t * 1000, cpu: r1(r.cpu), ram_mb: r1(r.ram_mb), players: r.players, tps: r1(r.tps), mspt: r1(r.mspt) })),
    };
  }

  purge() {
    const cutoff = Math.floor(Date.now() / 1000) - RETENTION_DAYS * 86400;
    db.prepare("DELETE FROM metrics WHERE ts < ?").run(cutoff);
  }
}

module.exports = new MetricsService();
