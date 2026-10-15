const dockerService = require("../services/dockerService");

/**
 * Register Docker-related Socket.io namespaces on the given server.
 *
 * Namespaces:
 *   /docker/stats — streams container stats every ~2 s
 *   /docker/logs  — streams container logs (follow mode, tail=100)
 *
 * @param {import("socket.io").Server} io
 */
function registerDockerSockets(io) {
  /* ── /docker/stats ───────────────────────────────────────── */
  const statsNs = io.of("/docker/stats");

  statsNs.on("connection", async (socket) => {
    console.log(`[docker/stats] Client connected: ${socket.id}`);

    let destroy;

    try {
      destroy = await dockerService.streamStats(
        (data) => socket.emit("stats", data),
        (err) => {
          console.error(`[docker/stats] Stream error:`, err.message);
          socket.emit("error", { event: "error", message: err.message });
        }
      );
    } catch (err) {
      console.error(`[docker/stats] Failed to start stream:`, err.message);
      socket.emit("error", { event: "error", message: err.message });
    }

    socket.on("disconnect", () => {
      console.log(`[docker/stats] Client disconnected: ${socket.id}`);
      if (destroy) destroy();
    });
  });

  /* ── /docker/logs ────────────────────────────────────────── */
  const logsNs = io.of("/docker/logs");

  logsNs.on("connection", async (socket) => {
    console.log(`[docker/logs] Client connected: ${socket.id}`);

    let destroy;

    try {
      destroy = await dockerService.streamLogs(
        (data) => socket.emit("log", data),
        (err) => {
          console.error(`[docker/logs] Stream error:`, err.message);
          socket.emit("error", { event: "error", message: err.message });
        },
        100 // tail
      );
    } catch (err) {
      console.error(`[docker/logs] Failed to start stream:`, err.message);
      socket.emit("error", { event: "error", message: err.message });
    }

    socket.on("disconnect", () => {
      console.log(`[docker/logs] Client disconnected: ${socket.id}`);
      if (destroy) destroy();
    });
  });
}

module.exports = registerDockerSockets;
