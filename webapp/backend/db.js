const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const config = require("./config");

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

/* ── Schema ────────────────────────────────────────────────── */
db.exec(`
  CREATE TABLE IF NOT EXISTS servers (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    slug               TEXT NOT NULL UNIQUE,
    name               TEXT NOT NULL,
    type               TEXT NOT NULL,
    version            TEXT NOT NULL DEFAULT 'LATEST',
    loader             TEXT,
    modpack            TEXT,
    modpack_version    TEXT,
    image_tag          TEXT NOT NULL DEFAULT 'latest',
    memory_mb          INTEGER NOT NULL,
    cpu_limit          REAL,
    port               INTEGER NOT NULL UNIQUE,
    map_port           INTEGER,
    map_container_port INTEGER NOT NULL DEFAULT 8100,
    rcon_password      TEXT NOT NULL,
    env_json           TEXT NOT NULL DEFAULT '{}',
    data_dir           TEXT NOT NULL,
    container_name     TEXT NOT NULL UNIQUE,
    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS players (
    uuid       TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    first_seen TEXT NOT NULL,
    last_seen  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id  INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    uuid       TEXT NOT NULL,
    name       TEXT NOT NULL,
    ip         TEXT,
    joined_at  TEXT NOT NULL,
    left_at    TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_server ON sessions(server_id, joined_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_uuid ON sessions(uuid);

  CREATE TABLE IF NOT EXISTS metrics (
    server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    ts        INTEGER NOT NULL,
    cpu       REAL,
    ram_mb    REAL,
    players   INTEGER,
    tps       REAL,
    mspt      REAL
  );
  CREATE INDEX IF NOT EXISTS idx_metrics_server_ts ON metrics(server_id, ts);

  CREATE TABLE IF NOT EXISTS mods (
    server_id      INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    filename       TEXT NOT NULL,
    sha1           TEXT,
    project_id     TEXT,
    version_id     TEXT,
    title          TEXT,
    version_number TEXT,
    icon_url       TEXT,
    PRIMARY KEY (server_id, filename)
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    ts        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    action    TEXT NOT NULL,
    server_id INTEGER,
    target    TEXT,
    details   TEXT,
    ip        TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts);
`);

/* ── Migrations for databases created by older versions ───── */
const serverColumns = db.prepare("PRAGMA table_info(servers)").all().map((c) => c.name);
if (!serverColumns.includes("image_tag")) {
  db.exec("ALTER TABLE servers ADD COLUMN image_tag TEXT NOT NULL DEFAULT 'latest'");
}

module.exports = db;
