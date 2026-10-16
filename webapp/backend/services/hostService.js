const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const config = require("../config");

const DISK_CACHE_MS = 10 * 60 * 1000;
const diskCache = new Map(); // dir -> { at, bytes }

function memAvailableMb() {
  try {
    const m = fs.readFileSync("/proc/meminfo", "utf8").match(/MemAvailable:\s+(\d+) kB/);
    if (m) return Math.round(parseInt(m[1], 10) / 1024);
  } catch {
    /* not Linux */
  }
  return Math.round(os.freemem() / 1024 / 1024);
}

function du(dir) {
  return new Promise((resolve) => {
    execFile("du", ["-sb", dir], { timeout: 120000 }, (err, stdout) => {
      resolve(err && !stdout ? null : parseInt(String(stdout).split(/\s/)[0], 10) || 0);
    });
  });
}

/**
 * Host capacity (RAM/CPU/disk), per-server disk usage and crash reports.
 */
const hostService = {
  async summary() {
    const serverService = require("./serverService");
    const rows = serverService.listRows();
    let disk = null;
    try {
      fs.mkdirSync(config.serversRoot, { recursive: true });
      const s = await fs.promises.statfs(config.serversRoot);
      disk = { totalBytes: s.blocks * s.bsize, freeBytes: s.bavail * s.bsize };
    } catch {
      /* statfs unsupported */
    }
    return {
      hostname: os.hostname(),
      cpus: os.cpus().length,
      cpuModel: os.cpus()[0]?.model || null,
      loadavg: os.loadavg(),
      memTotalMb: Math.round(os.totalmem() / 1024 / 1024),
      memAvailableMb: memAvailableMb(),
      allocatedMb: rows.reduce((s, r) => s + r.memory_mb, 0),
      allocatedCpus: rows.reduce((s, r) => s + (r.cpu_limit || 0), 0),
      disk,
      uptimeS: Math.round(os.uptime()),
    };
  },

  /** Cached `du` of a directory (10 min). */
  async dirBytes(dir, { fresh = false } = {}) {
    const hit = diskCache.get(dir);
    if (!fresh && hit && Date.now() - hit.at < DISK_CACHE_MS) return hit.bytes;
    if (!fs.existsSync(dir)) return 0;
    const bytes = await du(dir);
    diskCache.set(dir, { at: Date.now(), bytes });
    return bytes;
  },

  async serverDisk(row, opts) {
    const worldService = require("./worldService");
    const backupService = require("./backupService");
    const level = worldService.activeLevel(row);
    const [data, world, backups] = await Promise.all([
      this.dirBytes(row.data_dir, opts),
      this.dirBytes(path.join(row.data_dir, level), opts),
      this.dirBytes(backupService.dirFor(row), opts),
    ]);
    return { dataBytes: data, worldBytes: world, backupsBytes: backups };
  },

  async crashReports(row) {
    const dir = path.join(row.data_dir, "crash-reports");
    const files = await fs.promises.readdir(dir).catch(() => []);
    const out = [];
    for (const f of files.filter((x) => x.endsWith(".txt"))) {
      const stat = await fs.promises.stat(path.join(dir, f));
      out.push({ name: f, size: stat.size, mtime: stat.mtime.toISOString() });
    }
    return out.sort((a, b) => b.mtime.localeCompare(a.mtime));
  },

  async crashReport(row, name) {
    const safe = path.basename(name);
    if (!safe.endsWith(".txt")) throw Object.assign(new Error("Archivo inválido."), { status: 400 });
    const file = path.join(row.data_dir, "crash-reports", safe);
    const content = await fs.promises.readFile(file, "utf8").catch(() => null);
    if (content === null) throw Object.assign(new Error("Informe no encontrado."), { status: 404 });
    return content.slice(0, 512 * 1024);
  },
};

module.exports = hostService;
