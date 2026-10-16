const fs = require("fs");
const path = require("path");
const extractZip = require("extract-zip");
const { ZipArchive } = require("archiver");
const lockService = require("./lockService");
const rconService = require("./rconService");
const { HttpError } = require("../httpError");

const RE_WORLD = /^[A-Za-z0-9_-]{1,32}$/;

/**
 * A folder is a world if it has level.dat, or (before the first save, on
 * recent versions) a region/ folder plus session.lock or uid.dat.
 */
function isWorldDir(dir) {
  if (fs.existsSync(path.join(dir, "level.dat"))) return true;
  return fs.existsSync(path.join(dir, "region")) && (fs.existsSync(path.join(dir, "session.lock")) || fs.existsSync(path.join(dir, "uid.dat")));
}
const DIM_SUFFIXES = ["_nether", "_the_end"];

function serverService() {
  return require("./serverService");
}

function activeLevel(row) {
  const env = JSON.parse(row.env_json || "{}");
  return env.LEVEL || serverService().readProperties(row)["level-name"] || "world";
}

/** Paper/Purpur keep each dimension in its own folder (world_nether…). */
function splitDimensions(row) {
  return ["PAPER", "PURPUR"].includes(row.type) || ["paper", "purpur"].includes(row.loader);
}

/**
 * Multiple worlds per server: list, switch the active one (LEVEL env +
 * container recreate), upload/download zips and reset Nether/End.
 */
class WorldService {
  validName(name) {
    if (!RE_WORLD.test(String(name))) throw new HttpError(400, "Nombre de mundo inválido (letras, números, _ y -).");
    return String(name);
  }

  async list(row) {
    const active = activeLevel(row);
    const entries = await fs.promises.readdir(row.data_dir, { withFileTypes: true }).catch(() => []);
    const names = entries
      .filter((e) => e.isDirectory() && isWorldDir(path.join(row.data_dir, e.name)))
      .map((e) => e.name);
    const bases = names.filter((n) => !DIM_SUFFIXES.some((s) => n.endsWith(s) && names.includes(n.slice(0, -s.length))));

    const out = [];
    for (const name of bases) {
      const dirs = [name, ...DIM_SUFFIXES.map((s) => name + s).filter((d) => names.includes(d))];
      let size = 0;
      for (const d of dirs) size += await require("./hostService").dirBytes(path.join(row.data_dir, d));
      const stat = await fs.promises.stat(path.join(row.data_dir, name));
      out.push({ name, active: name === active, size, dirs, lastPlayed: stat.mtime.toISOString() });
    }
    return out.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  }

  /** Make `name` the active world. Recreates and restarts the container. */
  async setActive(row, name) {
    this.validName(name);
    const exists = isWorldDir(path.join(row.data_dir, name));
    if (!exists) throw new HttpError(404, `El mundo ${name} no existe. Para crear uno nuevo usa "Nuevo mundo".`);
    return this._switch(row, name);
  }

  /** Point LEVEL at a new, not-yet-existing world; the server generates it. */
  async createNew(row, name) {
    this.validName(name);
    if (fs.existsSync(path.join(row.data_dir, name))) throw new HttpError(409, "Ya existe una carpeta con ese nombre.");
    return this._switch(row, name);
  }

  async _switch(row, name) {
    const svc = serverService();
    return lockService.withLock(row.id, "world-switch", async () => {
      const updated = svc.setEnvKey(row.id, "LEVEL", name);
      await svc.recreate(updated);
      return svc.get(row.id);
    });
  }

  async upload(row, zipPath, name) {
    this.validName(name);
    const target = path.join(row.data_dir, name);
    if (fs.existsSync(target)) throw new HttpError(409, "Ya existe un mundo con ese nombre.");
    const tmp = path.join(row.data_dir, `.upload-${Date.now()}`);
    return lockService.withLock(row.id, "world-upload", async () => {
      try {
        // extract-zip rejects entries escaping the target folder (zip-slip)
        await extractZip(zipPath, { dir: tmp });
        const root = await this._findLevelRoot(tmp);
        if (!root) throw new HttpError(400, "El zip no contiene un mundo (falta level.dat).");
        await fs.promises.rename(root, target);
      } finally {
        await fs.promises.rm(tmp, { recursive: true, force: true });
        await fs.promises.rm(zipPath, { force: true });
      }
      return { name };
    });
  }

  async _findLevelRoot(dir, depth = 0) {
    if (isWorldDir(dir)) return dir;
    if (depth >= 2) return null;
    for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== "__MACOSX") {
        const found = await this._findLevelRoot(path.join(dir, entry.name), depth + 1);
        if (found) return found;
      }
    }
    return null;
  }

  /** Stream a world (plus its Paper dimension folders) as a zip. */
  async download(row, name, res) {
    this.validName(name);
    const worlds = await this.list(row);
    const world = worlds.find((w) => w.name === name);
    if (!world) throw new HttpError(404, "Mundo no encontrado.");
    if (world.active) await rconService.tryExec(row, "save-all flush");

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${row.slug}-${name}.zip"`);
    const archive = new ZipArchive({ zlib: { level: 6 } });
    archive.on("error", (err) => res.destroy(err));
    archive.pipe(res);
    for (const d of world.dirs) archive.directory(path.join(row.data_dir, d), d, (entry) =>
      entry.name === "session.lock" ? false : entry
    );
    await archive.finalize();
  }

  /** Delete the Nether or End of a world. The server must be stopped. */
  async resetDimension(row, name, dimension) {
    this.validName(name);
    if (!["nether", "end"].includes(dimension)) throw new HttpError(400, "Dimensión inválida.");
    return lockService.withLock(row.id, "world-reset", async () => {
      if (await serverService().isRunning(row)) throw new HttpError(409, "Detén el servidor antes de resetear una dimensión.");
      const targets = splitDimensions(row)
        ? [path.join(row.data_dir, `${name}${dimension === "nether" ? "_nether" : "_the_end"}`)]
        : [path.join(row.data_dir, name, dimension === "nether" ? "DIM-1" : "DIM1")];
      for (const t of targets) await fs.promises.rm(t, { recursive: true, force: true });
      return { removed: targets.map((t) => path.relative(row.data_dir, t)) };
    });
  }

  async remove(row, name) {
    this.validName(name);
    if (name === activeLevel(row)) throw new HttpError(400, "No puedes borrar el mundo activo.");
    return lockService.withLock(row.id, "world-delete", async () => {
      for (const d of [name, ...DIM_SUFFIXES.map((s) => name + s)]) {
        await fs.promises.rm(path.join(row.data_dir, d), { recursive: true, force: true });
      }
    });
  }

  activeLevel(row) {
    return activeLevel(row);
  }

  splitDimensions(row) {
    return splitDimensions(row);
  }
}

module.exports = new WorldService();
