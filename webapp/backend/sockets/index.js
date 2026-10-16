const serverService = require("../services/serverService");
const monitor = require("../services/serverMonitor");
const playerService = require("../services/playerService");
const backupService = require("../services/backupService");
const terminalService = require("../services/terminalService");
const lockService = require("../services/lockService");
const { socketAuth } = require("../middleware/auth");

/**
 * Single authenticated namespace. Clients join rooms on demand:
 *
 *   client → "subscribe"      { serverId }  join server:<id>, receive a snapshot
 *   client → "unsubscribe"    { serverId }
 *   client → "terminal:join"  { serverId }  join terminal:<id>, receive history
 *   client → "terminal:leave" { serverId }
 *   client → "terminal:input" { serverId, command }, ack({ ok, error })
 *
 *   server → "servers:summary", "server:status", "server:lock", "server:progress",
 *            "stats", "players:update", "players:event", "backup:status",
 *            "backup:log", "terminal:output", "pregen:progress", "server:crash"
 *
 * @param {import("socket.io").Server} io
 */
function registerSockets(io) {
  io.use(socketAuth);

  io.on("connection", (socket) => {
    const ctx = { ip: socket.handshake.address };
    socket.join("global");

    const rowOf = (payload) => {
      try {
        return serverService.getRow(payload?.serverId);
      } catch {
        return null;
      }
    };

    socket.on("subscribe", (payload) => {
      const row = rowOf(payload);
      if (!row) return;
      socket.join(`server:${row.id}`);
      const state = monitor.getState(row.id);
      socket.emit("server:status", { serverId: row.id, ...state });
      if (state.stats) socket.emit("stats", { serverId: row.id, ...state.stats, uptime_ms: state.uptime_ms });
      socket.emit("server:lock", { serverId: row.id, lock: lockService.get(row.id) });
      socket.emit("players:update", {
        serverId: row.id,
        online: playerService.getOnline(row.id),
        max: playerService.maxPlayers(row.id),
      });
      const op = backupService.getStatus(row);
      socket.emit("backup:status", { serverId: row.id, activeOp: op.activeOp, status: op.status });
    });

    socket.on("unsubscribe", (payload) => {
      if (payload?.serverId) socket.leave(`server:${Number(payload.serverId)}`);
    });

    socket.on("terminal:join", async (payload) => {
      const row = rowOf(payload);
      if (!row) return;
      socket.join(`terminal:${row.id}`);
      try {
        const history = await terminalService.history(row, 500);
        socket.emit("terminal:history", { serverId: row.id, data: history });
      } catch (err) {
        socket.emit("terminal:history", { serverId: row.id, data: "", error: err.message });
      }
    });

    socket.on("terminal:leave", (payload) => {
      if (payload?.serverId) socket.leave(`terminal:${Number(payload.serverId)}`);
    });

    socket.on("terminal:input", (payload, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      const row = rowOf(payload);
      if (!row) return reply({ ok: false, error: "Servidor no encontrado." });
      try {
        terminalService.send(row, payload.command, ctx);
        reply({ ok: true });
      } catch (err) {
        reply({ ok: false, error: err.message });
      }
    });
  });
}

module.exports = registerSockets;
