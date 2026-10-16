const config = require("./config");

const fs = require("fs");
const path = require("path");
const express = require("express");
const http = require("http");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { Server } = require("socket.io");

const realtime = require("./realtime");
const auth = require("./middleware/auth");
const serversRoutes = require("./routes/servers");
const playersRoutes = require("./routes/players");
const modsRoutes = require("./routes/mods");
const worldsRoutes = require("./routes/worlds");
const backupsRoutes = require("./routes/backups");
const miscRoutes = require("./routes/misc");
const googleDriveRoutes = require("./routes/googleDrive");
const registerSockets = require("./sockets");
const serverMonitor = require("./services/serverMonitor");
const playerService = require("./services/playerService");
const metricsService = require("./services/metricsService");
const pregenService = require("./services/pregenService");

if (!config.adminPassword) {
  console.warn("⚠️  ADMIN_PASSWORD is not set — nobody can log in until it is defined in webapp/backend/.env.");
}

/* ── Express + HTTP server ─────────────────────────────────── */
const app = express();
const server = http.createServer(app);

app.set("trust proxy", "loopback");
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

/* ── REST routes ───────────────────────────────────────────── */
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});
app.use("/api/auth", auth.router);

app.use("/api", auth.requireAuth);
app.use("/api/servers/:id/players", playersRoutes.serverRouter);
app.use("/api/servers/:id/mods", modsRoutes);
app.use("/api/servers/:id/worlds", worldsRoutes);
app.use("/api/servers/:id/backups", backupsRoutes);
app.use("/api/servers", serversRoutes);
app.use("/api/players", playersRoutes.globalRouter);
app.use("/api/google-drive", googleDriveRoutes);
app.use("/api", miscRoutes);
app.use("/api", (_req, res) => res.status(404).json({ error: "Ruta no encontrada." }));

// Multer errors (file too large…) and anything else unhandled
app.use((err, _req, res, _next) => {
  const status = err.code === "LIMIT_FILE_SIZE" ? 413 : err.status || 500;
  if (status >= 500) console.error("[express]", err);
  res.status(status).json({ error: err.message });
});

/* ── Frontend (production build) ───────────────────────────── */
const distDir = path.join(__dirname, "..", "frontend", "dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  // SPA fallback for client-side routes
  app.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile(path.join(distDir, "index.html")));
}

/* ── Socket.io ─────────────────────────────────────────────── */
const io = new Server(server, {
  cors: { origin: config.corsOrigin, methods: ["GET", "POST"], credentials: true },
});
realtime.setIo(io);
registerSockets(io);

/* ── Start ─────────────────────────────────────────────────── */
async function start() {
  playerService.init();
  pregenService.init();
  metricsService.init();
  await serverMonitor.init().catch((err) => {
    console.error("❌ Cannot reach Docker:", err.message);
  });

  server.listen(config.port, () => {
    console.log(`🚀 Panel backend listening on http://localhost:${config.port}`);
    console.log(`   CORS origin  : ${config.corsOrigin}`);
    console.log(`   Docker socket: ${config.dockerSocketPath}`);
    console.log(`   Servers root : ${config.serversRoot}`);
    console.log(`   Backups root : ${config.backupsRoot}`);
    console.log(`   Frontend     : ${fs.existsSync(distDir) ? distDir : "not built (use the Vite dev server)"}`);
  });
}

start();
