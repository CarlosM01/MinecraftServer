const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const config = require("../config");
const realtime = require("../realtime");
const lockService = require("./lockService");
const { HttpError } = require("../httpError");

/** Re-downloadable or volatile content left out of full-data backups. */
const BACKUP_EXCLUDES = [
  "/libraries/",
  "/versions/",
  "/cache/",
  "/.cache/",
  "/logs/",
  "/crash-reports/",
  "/*.jar",
  "/.restore-*",
  "/.upload-*",
];
const MAX_LOG_LINES = 500;

function envOf(row) {
  try {
    return JSON.parse(row.env_json || "{}");
  } catch {
    return {};
  }
}

/**
 * Per-server backups stored in backup/<slug>/. The heavy lifting is done by
 * the Python scripts in /scripts so they also work from the command line.
 */
class BackupService {
  constructor() {
    this.ops = new Map(); // serverId -> { activeOp, status, logs }
  }

  dirFor(row) {
    return path.join(config.backupsRoot, row.slug);
  }

  /** Absolute path of a backup, guarding against path traversal. */
  resolveBackupPath(row, name) {
    const safe = path.basename(String(name));
    const full = path.join(this.dirFor(row), safe);
    if (!safe || !fs.existsSync(full)) throw new HttpError(404, `Backup ${safe} no encontrado.`);
    return full;
  }

  async list(row) {
    const dir = this.dirFor(row);
    if (!fs.existsSync(dir)) return [];
    const out = [];
    for (const file of await fs.promises.readdir(dir)) {
      if (file.startsWith(".")) continue;
      const stat = await fs.promises.stat(path.join(dir, file));
      out.push({ name: file, size: stat.size, mtime: stat.mtime.toISOString(), isDir: stat.isDirectory() });
    }
    return out.sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
  }

  getStatus(row) {
    const op = this.ops.get(row.id) || { activeOp: null, status: "idle", logs: [] };
    return { activeOp: op.activeOp, status: op.status, logs: op.logs };
  }

  async remove(row, name) {
    const full = this.resolveBackupPath(row, name);
    return lockService.withLock(row.id, "delete-backup", () =>
      fs.promises.rm(full, { recursive: true, force: true })
    );
  }

  clearLogs(row) {
    const op = this.ops.get(row.id);
    if (op) op.logs = [];
    realtime.emit(`server:${row.id}`, "backup:logs_cleared", { serverId: row.id });
  }

  /* ── Script runner ────────────────────────────────────────── */

  _log(row, message) {
    const op = this.ops.get(row.id);
    const entry = { timestamp: new Date().toISOString(), message };
    if (op) {
      op.logs.push(entry);
      if (op.logs.length > MAX_LOG_LINES) op.logs.shift();
    }
    realtime.emit(`server:${row.id}`, "backup:log", { serverId: row.id, ...entry });
  }

  _setStatus(row, activeOp, status) {
    const op = this.ops.get(row.id) || { logs: [] };
    if (status === "running") op.logs = [];
    Object.assign(op, { activeOp, status });
    this.ops.set(row.id, op);
    const payload = { serverId: row.id, activeOp, status };
    realtime.emit(`server:${row.id}`, "backup:status", payload);
    realtime.emit("global", "backup:status", payload);
  }

  /** Run a script, streaming output into the op log. Resolves to exit code. */
  _spawn(row, script, args, onLog) {
    return new Promise((resolve) => {
      const child = spawn("python3", [path.join(config.scriptsDir, script), ...args], { cwd: config.repoRoot });
      const handle = (data) => {
        for (const line of data.toString().split("\n")) {
          const trimmed = line.trimEnd();
          if (!trimmed) continue;
          this._log(row, trimmed);
          onLog?.(trimmed);
        }
      };
      child.stdout.on("data", handle);
      child.stderr.on("data", handle);
      child.on("error", (err) => {
        this._log(row, `Error del sistema: no se pudo lanzar el script. ${err.message}`);
        resolve(1);
      });
      child.on("close", (code) => resolve(code ?? 1));
    });
  }

  /** Warn players and flush the world before the scripts stop the server. */
  async _prepareRunningServer(row, message) {
    const rcon = require("./rconService");
    const monitor = require("./serverMonitor");
    if (!monitor.isOnline(row.id)) return;
    await rcon.tryExec(row, `say [Panel] ${message}`);
    await rcon.tryExec(row, "save-all flush");
    monitor.expectStop(row.id);
  }

  /**
   * Create a backup. Does not take the lock (callers decide), so it can run
   * inside other locked operations such as upgrades.
   * @returns {Promise<boolean>} success
   */
  async run(row, { reason = "manual", onLog } = {}) {
    this._setStatus(row, "backup", "running");
    this._log(row, `Iniciando backup (${reason})…`);
    await this._prepareRunningServer(row, "Backup en curso: el servidor se reiniciará en unos segundos.");

    const prefix = reason === "pre-upgrade" ? `${row.slug}_pre-upgrade` : row.slug;
    const args = ["--source", row.data_dir, "--dest", this.dirFor(row), "--container", row.container_name, "--prefix", prefix];
    for (const pattern of BACKUP_EXCLUDES) args.push("--exclude", pattern);
    fs.mkdirSync(this.dirFor(row), { recursive: true });

    const code = await this._spawn(row, "backup_script.py", args, onLog);
    const ok = code === 0;
    this._setStatus(row, "backup", ok ? "success" : "failed");
    if (ok) this._uploadNewest(row).catch(() => {});
    return ok;
  }

  /** Lock + run in the background; the HTTP request returns immediately. */
  _background(row, op, fn) {
    lockService.acquire(row.id, op);
    fn()
      .catch((err) => {
        this._log(row, `Error: ${err.message}`);
        this._setStatus(row, op, "failed");
      })
      .finally(() => lockService.release(row.id));
  }

  triggerBackup(row) {
    this._background(row, "backup", () => this.run(row));
  }

  triggerRestore(row, name) {
    const archive = this.resolveBackupPath(row, name);
    this._background(row, "restore", async () => {
      this._setStatus(row, "restore", "running");
      await this._prepareRunningServer(row, "Restaurando un backup: el servidor se reiniciará.");
      const code = await this._spawn(row, "restore_script.py", [
        "--file", archive,
        "--dest", row.data_dir,
        "--level", envOf(row).LEVEL || "world",
        "--container", row.container_name,
      ]);
      this._setStatus(row, "restore", code === 0 ? "success" : "failed");
    });
  }

  triggerTest(row, name) {
    const archive = this.resolveBackupPath(row, name);
    this._background(row, "test", async () => {
      this._setStatus(row, "test", "running");
      const serverService = require("./serverService");
      const port = await serverService.nextFreePort();
      const args = [
        "--file", archive,
        "--name", `mc-test-${row.slug}`,
        "--port", String(port),
        "--data-dir", path.join(this.dirFor(row), ".test-data"),
        "--image", serverService.imageOf(row),
        "--type", row.type,
        "--version", row.version,
        "--memory", `${row.memory_mb}M`,
        "--level", envOf(row).LEVEL || "world",
      ];
      if (row.type === "MODRINTH") {
        args.push("--env", `MODRINTH_MODPACK=${row.modpack}`);
        if (row.modpack_version) args.push("--env", `MODRINTH_VERSION=${row.modpack_version}`);
      }
      this._log(row, `Servidor de prueba en el puerto ${port}.`);
      const code = await this._spawn(row, "test_backup.py", args);
      this._setStatus(row, "test", code === 0 ? "success" : "failed");
    });
  }

  /** Extract an archive into a fresh data dir (used by "create from backup"). */
  async extractInto(archive, dataDir, level) {
    const code = await new Promise((resolve) => {
      const child = spawn("python3", [
        path.join(config.scriptsDir, "restore_script.py"),
        "--file", archive, "--dest", dataDir, "--level", level, "--no-server", "--no-clean",
      ]);
      child.on("error", () => resolve(1));
      child.on("close", (c) => resolve(c));
    });
    if (code !== 0) throw new Error("No se pudo extraer el backup.");
  }

  /* ── Google Drive ─────────────────────────────────────────── */

  async _uploadNewest(row) {
    const drive = require("./googleDriveService");
    if (!drive.isLinked()) return;
    const [newest] = await this.list(row);
    if (!newest || newest.isDir) return;
    this._log(row, `[Google Drive] Subiendo "${newest.name}"…`);
    try {
      const file = await drive.uploadBackup(path.join(this.dirFor(row), newest.name));
      this._log(row, `[Google Drive] Subido correctamente (ID: ${file.id}).`);
    } catch (err) {
      this._log(row, `[Google Drive] Error al subir: ${err.message}`);
    }
  }
}

module.exports = new BackupService();
