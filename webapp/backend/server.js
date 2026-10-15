require("dotenv").config();

const path = require("path");
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const dockerRoutes = require("./routes/docker");
const backupsRoutes = require("./routes/backups");
const googleDriveRoutes = require("./routes/googleDrive");
const registerDockerSockets = require("./sockets/docker");
const registerBackupSockets = require("./sockets/backups");

/* ── Express + HTTP server ─────────────────────────────────── */
const app = express();
const server = http.createServer(app);

const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

/* ── Serve frontend static files ───────────────────────────── */
app.use(express.static(path.join(__dirname, "..", "frontend")));

/* ── REST routes ───────────────────────────────────────────── */
app.use("/api/docker", dockerRoutes);
app.use("/api/backups", backupsRoutes);
app.use("/api/google-drive", googleDriveRoutes);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/* ── Socket.io ─────────────────────────────────────────────── */
const io = new Server(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ["GET", "POST"],
  },
});

registerDockerSockets(io);
registerBackupSockets(io);

/* ── Start ─────────────────────────────────────────────────── */
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 Dashboard backend listening on http://localhost:${PORT}`);
  console.log(`   CORS origin : ${CORS_ORIGIN}`);
  console.log(`   Docker socket: ${process.env.DOCKER_SOCKET_PATH || "/var/run/docker.sock"}`);
  console.log(`   Container   : ${process.env.MINECRAFT_CONTAINER_NAME || "minecraft-server"}`);
});
