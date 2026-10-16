require("dotenv").config();

const path = require("path");
const crypto = require("crypto");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

function parseRange(str, fallback) {
  const match = String(str || "").match(/^(\d+)\s*-\s*(\d+)$/);
  if (!match) return fallback;
  const [from, to] = [parseInt(match[1], 10), parseInt(match[2], 10)];
  return from <= to ? [from, to] : fallback;
}

let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  jwtSecret = crypto.randomBytes(32).toString("hex");
  console.warn("⚠️  JWT_SECRET is not set — using a random secret (sessions reset on every restart).");
}

/**
 * Central runtime configuration. Every path is absolute so that it can be
 * handed to Docker as a bind-mount source as-is.
 */
module.exports = {
  repoRoot: REPO_ROOT,
  // Repo path on the host (differs from repoRoot when the panel runs in a container)
  hostRepoRoot: process.env.HOST_REPO_ROOT || REPO_ROOT,
  port: parseInt(process.env.PORT || "3001", 10),
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
  dockerSocketPath: process.env.DOCKER_SOCKET_PATH || "/var/run/docker.sock",

  adminPassword: process.env.ADMIN_PASSWORD || "",
  jwtSecret,
  sessionHours: parseInt(process.env.SESSION_HOURS || "12", 10),

  serversRoot: path.resolve(REPO_ROOT, process.env.SERVERS_ROOT || "servers"),
  backupsRoot: path.resolve(REPO_ROOT, process.env.BACKUPS_ROOT || "backup"),
  dbPath: path.resolve(__dirname, process.env.PANEL_DB_PATH || "data/panel.db"),
  scriptsDir: path.join(REPO_ROOT, "scripts"),

  portRange: parseRange(process.env.PORT_RANGE, [25565, 25600]),
  // Image repository; each server picks a tag (latest, java21, java8…)
  mcImageRepo: (process.env.MC_IMAGE || "itzg/minecraft-server").split(":")[0],
  timezone: process.env.TZ || "",

  modrinthUserAgent:
    process.env.MODRINTH_USER_AGENT || "minecraft-server-panel/1.0 (self-hosted admin panel)",
};
