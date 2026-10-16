const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const db = require("../db");
const modrinth = require("./modrinthService");
const versionService = require("./versionService");
const { HttpError } = require("../httpError");

const q = {
  list: db.prepare("SELECT * FROM mods WHERE server_id = ?"),
  get: db.prepare("SELECT * FROM mods WHERE server_id = ? AND filename = ?"),
  upsert: db.prepare(`
    INSERT INTO mods (server_id, filename, sha1, project_id, version_id, title, version_number, icon_url)
    VALUES (@server_id, @filename, @sha1, @project_id, @version_id, @title, @version_number, @icon_url)
    ON CONFLICT(server_id, filename) DO UPDATE SET sha1=excluded.sha1, project_id=excluded.project_id,
      version_id=excluded.version_id, title=excluded.title, version_number=excluded.version_number,
      icon_url=excluded.icon_url`),
  rename: db.prepare("UPDATE mods SET filename = ? WHERE server_id = ? AND filename = ?"),
  remove: db.prepare("DELETE FROM mods WHERE server_id = ? AND filename = ?"),
};

const RE_FILE = /^[^/\\]+\.jar(\.disabled)?$/;

function sha1File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha1");
    fs.createReadStream(file)
      .on("data", (d) => hash.update(d))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

async function isZip(file) {
  const fd = await fs.promises.open(file, "r");
  try {
    const buf = Buffer.alloc(2);
    await fd.read(buf, 0, 2, 0);
    return buf.toString() === "PK";
  } finally {
    await fd.close();
  }
}

function serverService() {
  return require("./serverService");
}

/**
 * Mods (Fabric/Forge/NeoForge/Quilt/modpacks) and plugins (Paper/Purpur):
 * listing, manual uploads, Modrinth installs with dependencies, update
 * checks and pre-upgrade compatibility reports.
 */
class ModService {
  dirOf(row) {
    const kind = serverService().contentKind(row);
    if (!kind) throw new HttpError(400, "Este tipo de servidor no admite mods ni plugins (usa Paper, Fabric, Forge…).");
    return path.join(row.data_dir, kind);
  }

  safeName(filename) {
    const name = path.basename(String(filename));
    if (!RE_FILE.test(name)) throw new HttpError(400, "Nombre de archivo inválido.");
    return name;
  }

  /** Game version to filter by; resolves LATEST to the newest release. */
  async gameVersion(row, override) {
    const v = override || row.version;
    if (v && v !== "LATEST") return v;
    const { versions } = await versionService.list(row.type === "MODRINTH" ? "VANILLA" : row.type);
    return versions[0] || null;
  }

  /* ── Listing ──────────────────────────────────────────────── */

  async list(row) {
    const dir = this.dirOf(row);
    await fs.promises.mkdir(dir, { recursive: true });
    const files = (await fs.promises.readdir(dir)).filter((f) => RE_FILE.test(f));
    const known = new Map(q.list.all(row.id).map((m) => [m.filename, m]));

    // Drop metadata of files removed outside the panel
    for (const name of known.keys()) {
      if (!files.includes(name)) {
        q.remove.run(row.id, name);
        known.delete(name);
      }
    }

    // Hash new files and try to identify them on Modrinth
    const unknown = [];
    for (const name of files) {
      if (!known.has(name)) {
        const sha1 = await sha1File(path.join(dir, name));
        const meta = { server_id: row.id, filename: name, sha1, project_id: null, version_id: null, title: null, version_number: null, icon_url: null };
        known.set(name, meta);
        unknown.push(meta);
      }
    }
    if (unknown.length) await this._identify(unknown).catch(() => {});

    const out = [];
    for (const name of files) {
      const stat = await fs.promises.stat(path.join(dir, name));
      const meta = known.get(name);
      out.push({
        filename: name,
        enabled: !name.endsWith(".disabled"),
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        sha1: meta.sha1,
        projectId: meta.project_id || null,
        versionId: meta.version_id || null,
        title: meta.title || name.replace(/\.jar(\.disabled)?$/, ""),
        versionNumber: meta.version_number,
        iconUrl: meta.icon_url,
      });
    }
    return out.sort((a, b) => a.title.localeCompare(b.title));
  }

  /** Fill metadata for files whose hash Modrinth knows; persist all rows. */
  async _identify(metas) {
    let byHash = {};
    try {
      byHash = await modrinth.versionsByHash(metas.map((m) => m.sha1));
    } catch {
      /* offline: keep as unknown */
    }
    const projectIds = [...new Set(Object.values(byHash).map((v) => v.project_id))];
    const projects = new Map((await modrinth.projects(projectIds).catch(() => [])).map((p) => [p.id, p]));
    for (const meta of metas) {
      const v = byHash[meta.sha1];
      if (v) {
        const p = projects.get(v.project_id);
        Object.assign(meta, {
          project_id: v.project_id,
          version_id: v.id,
          version_number: v.version_number,
          title: p?.title || null,
          icon_url: p?.icon_url || null,
        });
      } else {
        meta.project_id = ""; // checked, not on Modrinth
      }
      q.upsert.run(meta);
    }
  }

  /* ── Files ────────────────────────────────────────────────── */

  async upload(row, tmpPath, originalName) {
    const dir = this.dirOf(row);
    const name = this.safeName(originalName.replace(/\s+/g, "_"));
    if (name.endsWith(".disabled")) throw new HttpError(400, "Sube el archivo .jar original.");
    try {
      if (!(await isZip(tmpPath))) throw new HttpError(400, "El archivo no es un .jar válido.");
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.copyFile(tmpPath, path.join(dir, name));
    } finally {
      await fs.promises.rm(tmpPath, { force: true });
    }
    q.remove.run(row.id, name);
    return name;
  }

  async remove(row, filename) {
    const name = this.safeName(filename);
    await fs.promises.rm(path.join(this.dirOf(row), name), { force: true });
    q.remove.run(row.id, name);
  }

  async toggle(row, filename, enabled) {
    const name = this.safeName(filename);
    const dir = this.dirOf(row);
    const target = enabled ? name.replace(/\.disabled$/, "") : name.endsWith(".disabled") ? name : `${name}.disabled`;
    if (target === name) return name;
    await fs.promises.rename(path.join(dir, name), path.join(dir, target));
    q.rename.run(target, row.id, name);
    return target;
  }

  /* ── Modrinth installs ────────────────────────────────────── */

  async search(row, { query, offset, projectType }) {
    const kind = serverService().contentKind(row);
    return modrinth.search({
      query,
      offset,
      projectType: projectType || (kind === "plugins" ? "plugin" : "mod"),
      loader: serverService().loaderOf(row),
      gameVersion: await this.gameVersion(row),
    });
  }

  async compatibleVersions(row, projectId) {
    return modrinth.versions(projectId, {
      loader: serverService().loaderOf(row),
      gameVersion: await this.gameVersion(row),
    });
  }

  /**
   * Install (or update) a project, plus its required dependencies.
   * @returns {Promise<string[]>} installed file names
   */
  async install(row, projectId, versionId = null, { gameVersion, loader, _seen = new Set(), _depth = 0 } = {}) {
    const dir = this.dirOf(row);
    const targetLoader = loader || serverService().loaderOf(row);
    const targetVersion = gameVersion || (await this.gameVersion(row));
    const version = versionId
      ? await modrinth.version(versionId)
      : await modrinth.bestVersion(projectId, { loader: targetLoader, gameVersion: targetVersion });
    if (!version) throw new HttpError(404, "No hay una versión compatible con este servidor.");
    if (_seen.has(version.project_id)) return [];
    _seen.add(version.project_id);

    const allowed = modrinth.loadersFor(targetLoader);
    if (allowed.length && !version.loaders.some((l) => allowed.includes(l))) {
      throw new HttpError(400, `La versión ${version.version_number} no es para ${targetLoader}.`);
    }

    const file = modrinth.primaryFile(version);
    const name = this.safeName(file.filename);
    await fs.promises.mkdir(dir, { recursive: true });
    const partial = path.join(dir, `.${name}.part`);
    try {
      const res = await fetch(file.url, { signal: AbortSignal.timeout(120000) });
      if (!res.ok) throw new HttpError(502, `Descarga fallida (HTTP ${res.status}).`);
      await fs.promises.writeFile(partial, Buffer.from(await res.arrayBuffer()));
      const sha1 = await sha1File(partial);
      if (sha1 !== file.hashes.sha1) throw new HttpError(502, "El hash SHA-1 del archivo descargado no coincide.");

      // Replace any other installed version of the same project
      for (const old of q.list.all(row.id).filter((m) => m.project_id === version.project_id && m.filename !== name)) {
        await fs.promises.rm(path.join(dir, old.filename), { force: true });
        q.remove.run(row.id, old.filename);
      }
      await fs.promises.rename(partial, path.join(dir, name));
    } finally {
      await fs.promises.rm(partial, { force: true });
    }

    const project = await modrinth.project(version.project_id).catch(() => null);
    q.upsert.run({
      server_id: row.id,
      filename: name,
      sha1: file.hashes.sha1,
      project_id: version.project_id,
      version_id: version.id,
      title: project?.title || version.name,
      version_number: version.version_number,
      icon_url: project?.icon_url || null,
    });

    const installed = [name];
    if (_depth < 4) {
      const have = new Set(q.list.all(row.id).map((m) => m.project_id).filter(Boolean));
      for (const dep of version.dependencies || []) {
        if (dep.dependency_type !== "required" || !dep.project_id || have.has(dep.project_id)) continue;
        try {
          installed.push(
            ...(await this.install(row, dep.project_id, null, { gameVersion: targetVersion, loader: targetLoader, _seen, _depth: _depth + 1 }))
          );
        } catch (err) {
          console.warn(`[mods] dependency ${dep.project_id} not installed:`, err.message);
        }
      }
    }
    return installed;
  }

  /** Installed Modrinth projects that have a newer compatible version. */
  async checkUpdates(row) {
    const mods = (await this.list(row)).filter((m) => m.projectId);
    const updates = await modrinth.updatesByHash(
      mods.map((m) => m.sha1),
      { loader: serverService().loaderOf(row), gameVersion: await this.gameVersion(row) }
    );
    return mods
      .filter((m) => updates[m.sha1] && updates[m.sha1].id !== m.versionId)
      .map((m) => ({
        filename: m.filename,
        title: m.title,
        projectId: m.projectId,
        currentVersion: m.versionNumber,
        latestVersion: updates[m.sha1].version_number,
        latestVersionId: updates[m.sha1].id,
      }));
  }

  /**
   * Which installed mods have a build for a target game version / loader.
   * @returns {Promise<{compatible: object[], incompatible: object[], unknown: object[]}>}
   */
  async upgradeCheck(row, { type, version, loader }) {
    const target = { ...row, type: type || row.type, loader: loader || row.loader };
    const kind = serverService().contentKind(target);
    if (!kind) return { compatible: [], incompatible: [], unknown: [], noMods: true };
    const targetLoader = serverService().loaderOf(target);
    const targetVersion = version && version !== "LATEST" ? version : await this.gameVersion(target, version);
    const mods = serverService().contentKind(row) ? await this.list(row) : [];

    const report = { compatible: [], incompatible: [], unknown: [], targetVersion, targetLoader };
    for (const m of mods.filter((x) => x.enabled)) {
      if (!m.projectId) {
        report.unknown.push({ filename: m.filename, title: m.title });
        continue;
      }
      const best = await modrinth.bestVersion(m.projectId, { loader: targetLoader, gameVersion: targetVersion }).catch(() => null);
      const entry = { filename: m.filename, title: m.title, projectId: m.projectId, currentVersion: m.versionNumber };
      if (best) report.compatible.push({ ...entry, targetVersion: best.version_number, targetVersionId: best.id });
      else report.incompatible.push(entry);
    }
    return report;
  }

  /**
   * Swap mods for the versions found by upgradeCheck. Incompatible mods are
   * disabled (renamed to .jar.disabled) when requested. Server must be stopped.
   */
  async applyUpgradeReport(row, report, { disableIncompatible }) {
    const log = [];
    for (const m of report.compatible) {
      try {
        await this.install(row, m.projectId, m.targetVersionId, { gameVersion: report.targetVersion, loader: report.targetLoader });
        log.push(`✔ ${m.title} → ${m.targetVersion}`);
      } catch (err) {
        log.push(`✖ ${m.title}: ${err.message}`);
      }
    }
    if (disableIncompatible) {
      for (const m of report.incompatible) {
        await this.toggle(row, m.filename, false).catch(() => {});
        log.push(`⏸ ${m.title} deshabilitado (sin versión compatible)`);
      }
    }
    return log;
  }

  /** True if a jar whose name starts with `prefix` is installed and enabled. */
  hasJar(row, prefix) {
    try {
      const dir = this.dirOf(row);
      return fs.readdirSync(dir).some((f) => f.toLowerCase().startsWith(prefix) && f.endsWith(".jar"));
    } catch {
      return false;
    }
  }
}

module.exports = new ModService();
