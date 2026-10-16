#!/usr/bin/env node
/**
 * Register the legacy single server (./data from the old docker-compose
 * setup) in the panel, using the MINECRAFT_* values of the root .env.
 * The panel backend must be running; ADMIN_PASSWORD comes from its .env.
 *
 *   node scripts/import-legacy.js [--start]
 */
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rootEnv = {};
const envFile = path.join(repoRoot, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) rootEnv[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function memoryMb(str = "4G") {
  const m = String(str).match(/^(\d+(?:\.\d+)?)\s*([gGmM])?$/);
  if (!m) return 4096;
  return Math.round(parseFloat(m[1]) * ((m[2] || "M").toUpperCase() === "G" ? 1024 : 1));
}

(async () => {
  const base = process.env.PANEL_URL || `http://localhost:${process.env.PORT || 3001}`;
  const login = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }),
  }).catch((err) => ({ ok: false, statusText: err.message }));
  if (!login.ok) {
    console.error(`❌ Login failed (${login.status || ""} ${login.statusText}). Is the panel running and ADMIN_PASSWORD set?`);
    process.exit(1);
  }
  const cookie = login.headers.get("set-cookie").split(";")[0];

  const body = {
    name: rootEnv.LEGACY_SERVER_NAME || "Servidor principal",
    dataDir: path.resolve(repoRoot, rootEnv.MINECRAFT_DATA_DIR || "data"),
    type: (rootEnv.MINECRAFT_TYPE || "VANILLA").toUpperCase(),
    version: rootEnv.MINECRAFT_VERSION || "LATEST",
    memory_mb: memoryMb(rootEnv.MINECRAFT_MEMORY),
    port: parseInt(rootEnv.MINECRAFT_PORT || "25565", 10),
    replaceContainer: "minecraft-server",
    start: process.argv.includes("--start"),
    allowOvercommit: true,
  };
  console.log("Importing legacy server:", body);
  const res = await fetch(`${base}/api/servers/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(`❌ ${data.error}`);
    process.exit(1);
  }
  console.log(`✅ Imported as "${data.name}" (id ${data.id}, container ${data.container_name}, port ${data.port}).`);
})();
