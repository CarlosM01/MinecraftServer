const fs = require("fs");
const path = require("path");
const db = require("../db");
const realtime = require("../realtime");
const monitor = require("./serverMonitor");
const rconService = require("./rconService");
const { parseListResponse } = require("../lib/parsers");
const { HttpError } = require("../httpError");

const RECONCILE_MS = 30000;
const RE_PLAYER = /^[A-Za-z0-9_.*-]{1,20}$/;
const nowIso = () => new Date().toISOString();

const q = {
  upsertPlayer: db.prepare(`
    INSERT INTO players (uuid, name, first_seen, last_seen) VALUES (@uuid, @name, @ts, @ts)
    ON CONFLICT(uuid) DO UPDATE SET name = excluded.name, last_seen = excluded.last_seen`),
  touch: db.prepare("UPDATE players SET last_seen = ? WHERE uuid = ?"),
  openSession: db.prepare(
    "INSERT INTO sessions (server_id, uuid, name, ip, joined_at) VALUES (?, ?, ?, ?, ?)"
  ),
  closeSession: db.prepare("UPDATE sessions SET left_at = ? WHERE id = ? AND left_at IS NULL"),
  setSessionIp: db.prepare("UPDATE sessions SET ip = ? WHERE id = ?"),
  closeStale: db.prepare(`
    UPDATE sessions SET left_at = COALESCE(
      (SELECT MAX(p.last_seen, sessions.joined_at) FROM players p WHERE p.uuid = sessions.uuid),
      sessions.joined_at)
    WHERE left_at IS NULL`),
};

/**
 * Tracks who is online on each server.
 *  - Real time: join/leave/UUID/IP lines from the attached console.
 *  - Every 30 s: reconciliation against RCON `list` (fixes missed lines and
 *    restores state after a panel restart).
 *  - Sessions are persisted for history and play-time statistics.
 */
class PlayerService {
  constructor() {
    this.online = new Map(); // serverId -> Map(lowerName -> {name, uuid, ip, joinedAt, sessionId})
    this.pending = new Map(); // serverId -> Map(lowerName -> {uuid?, ip?})
    this.max = new Map(); // serverId -> max players
  }

  init() {
    // Sessions left open by a previous run end at the player's last heartbeat
    q.closeStale.run();
    monitor.on("line", (id, _line, evt) => evt && this._onEvent(id, evt));
    monitor.on("stopped", (id) => this.closeAll(id));
    monitor.on("status", (id, state) => {
      if (state.status === "online") setTimeout(() => this.reconcile(id), 1000);
    });
    setInterval(() => this.reconcileAll(), RECONCILE_MS);
  }

  _map(store, id) {
    id = Number(id);
    if (!store.has(id)) store.set(id, new Map());
    return store.get(id);
  }

  onlineCount(id) {
    return this.online.get(Number(id))?.size || 0;
  }

  maxPlayers(id) {
    return this.max.get(Number(id)) ?? null;
  }

  getOnline(id) {
    return [...(this.online.get(Number(id))?.values() || [])].map(({ sessionId: _s, ...p }) => p);
  }

  /* ── Console events ───────────────────────────────────────── */

  _onEvent(id, evt) {
    const pending = this._map(this.pending, id);
    const key = evt.name?.toLowerCase();
    switch (evt.type) {
      case "uuid":
        pending.set(key, { ...pending.get(key), uuid: evt.uuid });
        break;
      case "login": {
        // Vanilla logs "logged in" before "joined the game"; Paper after it
        const entry = this.online.get(Number(id))?.get(key);
        if (entry) {
          entry.ip = evt.ip;
          q.setSessionIp.run(evt.ip, entry.sessionId);
          this._emitUpdate(id);
        } else {
          pending.set(key, { ...pending.get(key), ip: evt.ip });
        }
        break;
      }
      case "join": {
        const info = pending.get(key) || {};
        pending.delete(key);
        this._join(id, evt.name, info);
        break;
      }
      case "leave":
        this._leave(id, evt.name);
        break;
      default:
    }
  }

  _resolveUuid(id, name, known) {
    if (known) return known;
    try {
      const row = require("./serverService").getRow(id);
      const cache = JSON.parse(fs.readFileSync(path.join(row.data_dir, "usercache.json"), "utf8"));
      const hit = cache.find((e) => e.name?.toLowerCase() === name.toLowerCase());
      if (hit?.uuid) return hit.uuid;
    } catch {
      /* no usercache yet */
    }
    return `offline:${name.toLowerCase()}`;
  }

  _join(id, name, { uuid, ip } = {}, { quiet = false } = {}) {
    const online = this._map(this.online, id);
    const key = name.toLowerCase();
    if (online.has(key)) return;
    const ts = nowIso();
    const resolved = this._resolveUuid(id, name, uuid);
    q.upsertPlayer.run({ uuid: resolved, name, ts });
    const sessionId = q.openSession.run(Number(id), resolved, name, ip || null, ts).lastInsertRowid;
    online.set(key, { name, uuid: resolved, ip: ip || null, joinedAt: ts, sessionId });
    if (!quiet) this._emitEvent(id, "join", name, resolved);
    this._emitUpdate(id);
  }

  _leave(id, name, { quiet = false } = {}) {
    const online = this._map(this.online, id);
    const key = name.toLowerCase();
    const entry = online.get(key);
    if (!entry) return;
    const ts = nowIso();
    q.closeSession.run(ts, entry.sessionId);
    q.touch.run(ts, entry.uuid);
    online.delete(key);
    if (!quiet) this._emitEvent(id, "leave", entry.name, entry.uuid);
    this._emitUpdate(id);
  }

  closeAll(id) {
    const online = this.online.get(Number(id));
    if (!online?.size) return;
    for (const entry of [...online.values()]) this._leave(id, entry.name, { quiet: true });
  }

  /* ── Reconciliation ───────────────────────────────────────── */

  async reconcileAll() {
    const serverService = require("./serverService");
    for (const row of serverService.listRows()) {
      if (monitor.isOnline(row.id)) await this.reconcile(row.id).catch(() => {});
    }
  }

  async reconcile(id) {
    const row = require("./serverService").getRow(id);
    const out = await rconService.tryExec(row, "list");
    if (out === null) return;
    const parsed = parseListResponse(out);
    if (!parsed) return;
    this.max.set(row.id, parsed.max);

    const online = this._map(this.online, row.id);
    const listed = new Set(parsed.names.map((n) => n.toLowerCase()));
    for (const name of parsed.names) if (!online.has(name.toLowerCase())) this._join(row.id, name, {}, { quiet: true });
    for (const entry of [...online.values()]) if (!listed.has(entry.name.toLowerCase())) this._leave(row.id, entry.name, { quiet: true });

    // Heartbeat so a panel crash never inflates play time by more than 30 s
    const ts = nowIso();
    for (const entry of online.values()) q.touch.run(ts, entry.uuid);
    this._emitUpdate(row.id);
  }

  /* ── Broadcasts ───────────────────────────────────────────── */

  _emitUpdate(id) {
    const payload = { serverId: Number(id), online: this.getOnline(id), max: this.maxPlayers(id) };
    realtime.emit(`server:${id}`, "players:update", payload);
    realtime.emit("global", "players:update", payload);
  }

  _emitEvent(id, type, name, uuid) {
    const payload = { serverId: Number(id), type, name, uuid, ts: nowIso() };
    realtime.emit(`server:${id}`, "players:event", payload);
    realtime.emit("global", "players:event", payload);
  }

  /* ── Actions (RCON) ───────────────────────────────────────── */

  async action(row, action, name, reason = "") {
    if (!RE_PLAYER.test(name)) throw new HttpError(400, "Nombre de jugador inválido.");
    const cleanReason = String(reason || "").replace(/[\r\n]/g, " ").slice(0, 200);
    const commands = {
      kick: `kick ${name}${cleanReason ? " " + cleanReason : ""}`,
      ban: `ban ${name}${cleanReason ? " " + cleanReason : ""}`,
      pardon: `pardon ${name}`,
      op: `op ${name}`,
      deop: `deop ${name}`,
      "whitelist-add": `whitelist add ${name}`,
      "whitelist-remove": `whitelist remove ${name}`,
    };
    const cmd = commands[action];
    if (!cmd) throw new HttpError(400, `Acción desconocida: ${action}`);
    if (!monitor.isOnline(row.id)) throw new HttpError(409, "El servidor debe estar en línea.");
    return rconService.exec(row, cmd);
  }

  /** whitelist / ops / bans straight from the server's JSON files. */
  lists(row) {
    const read = (file) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(row.data_dir, file), "utf8"));
      } catch {
        return [];
      }
    };
    const props = require("./serverService").readProperties(row);
    return {
      whitelistEnabled: props["white-list"] === "true",
      whitelist: read("whitelist.json"),
      ops: read("ops.json"),
      bannedPlayers: read("banned-players.json"),
      bannedIps: read("banned-ips.json"),
    };
  }

  /* ── History ──────────────────────────────────────────────── */

  sessions({ serverId, uuid, limit = 100 } = {}) {
    const where = [];
    const params = [];
    if (serverId) {
      where.push("s.server_id = ?");
      params.push(serverId);
    }
    if (uuid) {
      where.push("s.uuid = ?");
      params.push(uuid);
    }
    return db
      .prepare(`
        SELECT s.*, sv.name AS server_name,
          CAST((julianday(COALESCE(s.left_at, ?)) - julianday(s.joined_at)) * 86400 AS INTEGER) AS duration_s
        FROM sessions s JOIN servers sv ON sv.id = s.server_id
        ${where.length ? "WHERE " + where.join(" AND ") : ""}
        ORDER BY s.joined_at DESC LIMIT ?`)
      .all(nowIso(), ...params, Math.min(limit, 1000));
  }

  /** Every known player with total play time and where they are now. */
  allPlayers({ serverId } = {}) {
    const rows = db
      .prepare(`
        SELECT p.uuid, p.name, p.first_seen, p.last_seen,
          COUNT(s.id) AS sessions,
          CAST(SUM((julianday(COALESCE(s.left_at, ?)) - julianday(s.joined_at)) * 86400) AS INTEGER) AS playtime_s
        FROM players p JOIN sessions s ON s.uuid = p.uuid
        ${serverId ? "WHERE s.server_id = ?" : ""}
        GROUP BY p.uuid ORDER BY p.last_seen DESC`)
      .all(nowIso(), ...(serverId ? [serverId] : []));

    const where = new Map();
    for (const [sid, map] of this.online) for (const e of map.values()) where.set(e.uuid, sid);
    return rows.map((r) => ({ ...r, onlineServerId: where.get(r.uuid) || null }));
  }

  player(uuid) {
    const row = db.prepare("SELECT * FROM players WHERE uuid = ?").get(uuid);
    if (!row) throw new HttpError(404, "Jugador no encontrado.");
    const perServer = db
      .prepare(`
        SELECT s.server_id, sv.name AS server_name, COUNT(*) AS sessions,
          CAST(SUM((julianday(COALESCE(s.left_at, ?)) - julianday(s.joined_at)) * 86400) AS INTEGER) AS playtime_s,
          MAX(s.joined_at) AS last_joined
        FROM sessions s JOIN servers sv ON sv.id = s.server_id
        WHERE s.uuid = ? GROUP BY s.server_id`)
      .all(nowIso(), uuid);
    return { ...row, perServer, sessions: this.sessions({ uuid, limit: 200 }) };
  }
}

module.exports = new PlayerService();
