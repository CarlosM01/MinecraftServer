const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const db = require("../db");
const config = require("../config");
const realtime = require("../realtime");
const dockerService = require("./dockerService");
const lockService = require("./lockService");
const { HttpError } = require("../httpError");

/* ── Constants ─────────────────────────────────────────────── */

const SERVER_TYPES = ["VANILLA", "PAPER", "PURPUR", "FABRIC", "QUILT", "FORGE", "NEOFORGE", "MODRINTH"];
const PLUGIN_TYPES = ["PAPER", "PURPUR"];
const MOD_LOADERS = { FABRIC: "fabric", QUILT: "quilt", FORGE: "forge", NEOFORGE: "neoforge" };

/** Game settings stored in env_json and mapped 1:1 to itzg env vars. */
const GAME_ENV_KEYS = [
  "MOTD",
  "MODE",
  "DIFFICULTY",
  "MAX_PLAYERS",
  "ONLINE_MODE",
  "PVP",
  "VIEW_DISTANCE",
  "SIMULATION_DISTANCE",
  "SEED",
  "LEVEL",
  "ENABLE_WHITELIST",
  "SPAWN_PROTECTION",
  "ALLOW_FLIGHT",
];
/** Env vars the panel controls; users cannot override them via EXTRA. */
const RESERVED_ENV = new Set([
  "EULA", "TYPE", "VERSION", "MEMORY", "INIT_MEMORY", "MAX_MEMORY", "ENABLE_RCON", "RCON_PASSWORD",
  "RCON_PORT", "MODRINTH_MODPACK", "MODRINTH_VERSION", "UID", "GID", "SERVER_PORT",
]);

/** itzg/minecraft-server tags: Java runtime per server (old Forge needs java8/java17). */
const IMAGE_TAGS = ["latest", "stable", "java25", "java21", "java17", "java11", "java8"];

const RE_VERSION = /^[A-Za-z0-9._+-]{1,40}$/;
const RE_MODPACK = /^([A-Za-z0-9_-]{1,64}|\/data\/[A-Za-z0-9_.-]+\.mrpack)$/;

/* ── Statements ────────────────────────────────────────────── */

const q = {
  all: db.prepare("SELECT * FROM servers ORDER BY name COLLATE NOCASE"),
  byId: db.prepare("SELECT * FROM servers WHERE id = ?"),
  bySlug: db.prepare("SELECT * FROM servers WHERE slug = ?"),
  insert: db.prepare(`
    INSERT INTO servers (slug, name, type, version, loader, modpack, modpack_version, image_tag, memory_mb, cpu_limit,
                         port, map_port, map_container_port, rcon_password, env_json, data_dir, container_name)
    VALUES (@slug, @name, @type, @version, @loader, @modpack, @modpack_version, @image_tag, @memory_mb, @cpu_limit,
            @port, @map_port, @map_container_port, @rcon_password, @env_json, @data_dir, @container_name)`),
  update: db.prepare(`
    UPDATE servers SET name=@name, type=@type, version=@version, loader=@loader, modpack=@modpack,
      modpack_version=@modpack_version, image_tag=@image_tag, memory_mb=@memory_mb, cpu_limit=@cpu_limit, port=@port,
      map_port=@map_port, map_container_port=@map_container_port, env_json=@env_json,
      updated_at=datetime('now')
    WHERE id=@id`),
  remove: db.prepare("DELETE FROM servers WHERE id = ?"),
};

/* ── Helpers ───────────────────────────────────────────────── */

function slugify(name) {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "server";
  let slug = base;
  for (let i = 2; q.bySlug.get(slug); i++) slug = `${base}-${i}`;
  return slug;
}

function parseEnv(row) {
  try {
    return JSON.parse(row.env_json || "{}");
  } catch {
    return {};
  }
}

function progress(serverId, message, extra = {}) {
  const payload = { serverId, message, ts: new Date().toISOString(), ...extra };
  realtime.emit("global", "server:progress", payload);
  realtime.emit(`server:${serverId}`, "server:progress", payload);
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} terminó con código ${code}: ${stderr.trim()}`))
    );
  });
}

function insideRoot(dir) {
  const rel = path.relative(config.serversRoot, dir);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/* ── Service ───────────────────────────────────────────────── */

class ServerService {
  constructor() {
    this.SERVER_TYPES = SERVER_TYPES;
    this.GAME_ENV_KEYS = GAME_ENV_KEYS;
    this.IMAGE_TAGS = IMAGE_TAGS;
  }

  imageOf(row) {
    return `${config.mcImageRepo}:${row.image_tag || "latest"}`;
  }

  /* Registry ------------------------------------------------- */

  listRows() {
    return q.all.all();
  }

  getRow(id) {
    const row = q.byId.get(Number(id));
    if (!row) throw new HttpError(404, "Servidor no encontrado.");
    return row;
  }

  /** Public representation (no secrets, live status merged in). */
  toPublic(row) {
    const monitor = require("./serverMonitor");
    const { rcon_password: _secret, env_json: _env, ...rest } = row;
    return {
      ...rest,
      env: parseEnv(row),
      contentKind: this.contentKind(row),
      loaderName: this.loaderOf(row),
      runtime: monitor.getState(row.id),
      lock: lockService.get(row.id),
    };
  }

  list() {
    return this.listRows().map((r) => this.toPublic(r));
  }

  get(id) {
    return this.toPublic(this.getRow(id));
  }

  /** "mods" | "plugins" | null — which content folder this server type uses. */
  contentKind(row) {
    if (PLUGIN_TYPES.includes(row.type)) return "plugins";
    if (MOD_LOADERS[row.type]) return "mods";
    if (row.type === "MODRINTH" && row.loader) return PLUGIN_TYPES.includes(row.loader.toUpperCase()) ? "plugins" : "mods";
    return null;
  }

  /** Modrinth loader name used for compatibility filtering. */
  loaderOf(row) {
    if (MOD_LOADERS[row.type]) return MOD_LOADERS[row.type];
    if (row.type === "PAPER") return "paper";
    if (row.type === "PURPUR") return "purpur";
    if (row.type === "MODRINTH") return row.loader || null;
    return null;
  }

  /* Validation ----------------------------------------------- */

  /**
   * Normalise and validate a create/update payload.
   * @param {object} input
   * @param {object|null} existing  Current row when updating.
   */
  async validate(input, existing = null) {
    const merged = { ...(existing || {}), ...input };
    const out = {};

    out.name = String(merged.name || "").trim();
    if (!out.name || out.name.length > 48) throw new HttpError(400, "El nombre debe tener entre 1 y 48 caracteres.");

    out.type = String(merged.type || "").toUpperCase();
    if (!SERVER_TYPES.includes(out.type)) throw new HttpError(400, `Tipo no soportado: ${merged.type}`);

    out.version = String(merged.version || "LATEST").trim();
    if (!RE_VERSION.test(out.version)) throw new HttpError(400, "Versión inválida.");

    out.modpack = out.type === "MODRINTH" ? String(merged.modpack || "").trim() : null;
    if (out.type === "MODRINTH" && !RE_MODPACK.test(out.modpack)) {
      throw new HttpError(400, "Indica un modpack de Modrinth (slug o ID) o sube un archivo .mrpack.");
    }
    out.modpack_version = out.type === "MODRINTH" && merged.modpack_version ? String(merged.modpack_version) : null;
    if (out.modpack_version && !/^[A-Za-z0-9]{1,16}$/.test(out.modpack_version)) {
      throw new HttpError(400, "ID de versión de modpack inválido.");
    }
    out.loader = out.type === "MODRINTH" ? (merged.loader ? String(merged.loader).toLowerCase() : null) : null;

    out.image_tag = String(merged.image_tag || "latest");
    if (!IMAGE_TAGS.includes(out.image_tag)) throw new HttpError(400, `Imagen/Java no soportada: ${out.image_tag}`);

    out.memory_mb = parseInt(merged.memory_mb, 10);
    const hostMb = Math.floor(os.totalmem() / 1024 / 1024);
    if (!(out.memory_mb >= 512 && out.memory_mb <= hostMb)) {
      throw new HttpError(400, `La memoria debe estar entre 512 MB y ${hostMb} MB.`);
    }

    const cpus = os.cpus().length;
    out.cpu_limit = merged.cpu_limit === null || merged.cpu_limit === "" || merged.cpu_limit === undefined
      ? null
      : parseFloat(merged.cpu_limit);
    if (out.cpu_limit !== null && !(out.cpu_limit >= 0.1 && out.cpu_limit <= cpus)) {
      throw new HttpError(400, `El límite de CPU debe estar entre 0.1 y ${cpus} núcleos.`);
    }

    out.port = merged.port ? parseInt(merged.port, 10) : await this.nextFreePort(existing?.id);
    if (!(out.port >= 1024 && out.port <= 65535)) throw new HttpError(400, "Puerto inválido.");

    out.map_port = merged.map_port ? parseInt(merged.map_port, 10) : null;
    if (out.map_port !== null && !(out.map_port >= 1024 && out.map_port <= 65535)) {
      throw new HttpError(400, "Puerto de mapa inválido.");
    }
    if (out.map_port && out.map_port === out.port) throw new HttpError(400, "El puerto del mapa debe ser distinto.");
    out.map_container_port = parseInt(merged.map_container_port || 8100, 10);

    // Game env: allowlisted keys + validated EXTRA map
    const envIn = input.env !== undefined ? input.env : existing ? parseEnv(existing) : {};
    const env = {};
    for (const key of GAME_ENV_KEYS) {
      const v = envIn[key];
      if (v === undefined || v === null || v === "") continue;
      env[key] = String(v).slice(0, 200);
    }
    if (env.LEVEL && !/^[A-Za-z0-9_-]{1,32}$/.test(env.LEVEL)) throw new HttpError(400, "Nombre de mundo inválido.");
    if (envIn.EXTRA && typeof envIn.EXTRA === "object") {
      env.EXTRA = {};
      for (const [k, v] of Object.entries(envIn.EXTRA)) {
        if (!/^[A-Z_][A-Z0-9_]{0,63}$/.test(k)) throw new HttpError(400, `Variable de entorno inválida: ${k}`);
        if (RESERVED_ENV.has(k) || GAME_ENV_KEYS.includes(k)) {
          throw new HttpError(400, `La variable ${k} la gestiona el panel.`);
        }
        env.EXTRA[k] = String(v).slice(0, 1000);
      }
    }
    out.env_json = JSON.stringify(env);

    // Ports must not clash with other servers or containers
    await this.assertPortFree(out.port, existing);
    if (out.map_port) await this.assertPortFree(out.map_port, existing);

    // Host memory overcommit protection
    const others = this.listRows().filter((r) => r.id !== existing?.id);
    const allocated = others.reduce((s, r) => s + r.memory_mb, 0) + out.memory_mb;
    if (allocated > hostMb * 0.9 && !input.allowOvercommit) {
      throw new HttpError(
        400,
        `La RAM asignada a todos los servidores (${allocated} MB) superaría el 90% de la RAM del host (${hostMb} MB). ` +
          "Reduce la memoria o confirma la sobreasignación."
      );
    }
    return out;
  }

  async assertPortFree(port, existing) {
    const clash = this.listRows().find(
      (r) => r.id !== existing?.id && (r.port === port || r.map_port === port)
    );
    if (clash) throw new HttpError(400, `El puerto ${port} ya lo usa el servidor "${clash.name}".`);

    // Ports used by other containers (ignore our own container)
    const own = existing ? await dockerService.inspect(existing.container_name) : null;
    const ownPorts = new Set(
      Object.values(own?.HostConfig?.PortBindings || {}).flat().map((b) => parseInt(b?.HostPort, 10))
    );
    const published = await dockerService.publishedPorts();
    if (published.has(port) && !ownPorts.has(port)) {
      throw new HttpError(400, `El puerto ${port} ya está publicado por otro contenedor.`);
    }

    // When the panel runs directly on the host, also probe the socket
    if (!fs.existsSync("/.dockerenv") && !ownPorts.has(port)) {
      const free = await new Promise((resolve) => {
        const srv = net.createServer();
        srv.once("error", () => resolve(false));
        srv.once("listening", () => srv.close(() => resolve(true)));
        srv.listen(port, "0.0.0.0");
      });
      if (!free) throw new HttpError(400, `El puerto ${port} está ocupado en el host.`);
    }
  }

  async nextFreePort(excludeId) {
    const used = new Set();
    for (const r of this.listRows()) {
      if (r.id === excludeId) continue;
      used.add(r.port);
      if (r.map_port) used.add(r.map_port);
    }
    for (const p of await dockerService.publishedPorts()) used.add(p);
    const [from, to] = config.portRange;
    for (let p = from; p <= to; p++) if (!used.has(p)) return p;
    throw new HttpError(400, `No quedan puertos libres en el rango ${from}-${to}.`);
  }

  /* Container ------------------------------------------------ */

  buildContainerSpec(row) {
    const env = parseEnv(row);
    const vars = {
      EULA: "TRUE",
      TYPE: row.type,
      MEMORY: `${row.memory_mb}M`,
      ENABLE_RCON: "TRUE",
      RCON_PASSWORD: row.rcon_password,
    };
    if (row.version && row.version !== "LATEST") vars.VERSION = row.version;
    if (row.type === "MODRINTH") {
      vars.MODRINTH_MODPACK = row.modpack;
      if (row.modpack_version) vars.MODRINTH_VERSION = row.modpack_version;
    }
    if (config.timezone) vars.TZ = config.timezone;
    for (const key of GAME_ENV_KEYS) if (env[key] !== undefined) vars[key] = env[key];
    Object.assign(vars, env.EXTRA || {});

    const overheadMb = Math.max(512, Math.round(row.memory_mb * 0.25));
    const exposed = { "25565/tcp": {} };
    const bindings = { "25565/tcp": [{ HostPort: String(row.port) }] };
    if (row.map_port) {
      exposed[`${row.map_container_port}/tcp`] = {};
      bindings[`${row.map_container_port}/tcp`] = [{ HostPort: String(row.map_port) }];
    }

    return {
      name: row.container_name,
      Image: this.imageOf(row),
      Env: Object.entries(vars).map(([k, v]) => `${k}=${v}`),
      Labels: { "mc-panel.server": String(row.id), "mc-panel.slug": row.slug },
      ExposedPorts: exposed,
      Tty: true,
      OpenStdin: true,
      StdinOnce: false,
      AttachStdin: false,
      StopTimeout: 60,
      HostConfig: {
        Binds: [`${row.data_dir}:/data`],
        PortBindings: bindings,
        Memory: (row.memory_mb + overheadMb) * 1024 * 1024,
        ...(row.cpu_limit ? { NanoCpus: Math.round(row.cpu_limit * 1e9) } : {}),
        RestartPolicy: { Name: "unless-stopped" },
      },
    };
  }

  async createContainer(row) {
    await dockerService.ensureImage(this.imageOf(row), (msg) => progress(row.id, msg));
    const container = await dockerService.docker.createContainer(this.buildContainerSpec(row));
    progress(row.id, "Contenedor creado.");
    return container;
  }

  /**
   * Destroy and recreate the container from the current row (keeps data).
   * @param {{start?: boolean}} [opts] start=true forces a start afterwards.
   */
  async recreate(row, { start } = {}) {
    const info = await dockerService.inspect(row.container_name);
    const wasRunning = Boolean(info?.State?.Running);
    if (info) {
      if (wasRunning) {
        progress(row.id, "Deteniendo el servidor…");
        require("./serverMonitor").expectStop(row.id);
        await dockerService.getContainer(row.container_name).stop({ t: 60 }).catch(ignoreNotRunning);
      }
      await dockerService.getContainer(row.container_name).remove({ force: true });
    }
    const container = await this.createContainer(row);
    if (start ?? wasRunning) {
      progress(row.id, "Iniciando el servidor…");
      await container.start();
    }
  }

  /* Lifecycle ------------------------------------------------ */

  /**
   * Register a new server and build its container in the background.
   * @param {object} input
   * @param {{dataDir?: string, modpackFile?: string, start?: boolean, seed?: (dataDir: string) => Promise<void>}} [opts]
   */
  async create(input, opts = {}) {
    const spec = await this.validate(input);
    const slug = slugify(spec.name);
    const dataDir = opts.dataDir ? path.resolve(opts.dataDir) : path.join(config.serversRoot, slug, "data");
    const row = {
      ...spec,
      slug,
      rcon_password: crypto.randomBytes(18).toString("base64url"),
      data_dir: dataDir,
      container_name: `mc-${slug}`,
    };
    if (opts.modpackFile) row.modpack = "/data/modpack.mrpack";

    const existingContainer = await dockerService.inspect(row.container_name);
    if (existingContainer) throw new HttpError(409, `Ya existe un contenedor llamado ${row.container_name}.`);

    const id = q.insert.run(row).lastInsertRowid;
    const saved = this.getRow(id);

    // Heavy lifting (data seeding, image pull) happens after responding
    lockService.acquire(id, "create");
    (async () => {
      try {
        await fs.promises.mkdir(dataDir, { recursive: true });
        if (opts.modpackFile) {
          await fs.promises.copyFile(opts.modpackFile, path.join(dataDir, "modpack.mrpack"));
          await fs.promises.rm(opts.modpackFile, { force: true });
        }
        if (opts.seed) {
          progress(id, "Preparando datos del servidor…");
          await opts.seed(dataDir);
        }
        const container = await this.createContainer(saved);
        if (opts.start !== false) {
          progress(id, "Iniciando el servidor…");
          await container.start();
        }
        progress(id, "Servidor listo.", { done: true });
      } catch (err) {
        console.error(`[serverService] create ${slug} failed:`, err);
        progress(id, `Error: ${err.message}`, { error: true, done: true });
      } finally {
        lockService.release(id);
      }
    })();

    return this.toPublic(saved);
  }

  /**
   * Apply configuration changes. Changing the game version, type or modpack
   * triggers a mandatory backup first; the upgrade aborts if it fails.
   */
  /**
   * @param {object} [opts]
   * @param {(row: object) => Promise<void>} [opts.beforeRecreate]  Runs with the server
   *        stopped and the new config saved (used to swap mods during upgrades).
   */
  async update(id, input, { skipBackup = false, onLog, beforeRecreate } = {}) {
    const current = this.getRow(id);
    if (input.port === undefined) input = { ...input, port: current.port };
    const spec = await this.validate(input, current);
    const risky =
      spec.type !== current.type ||
      spec.version !== current.version ||
      spec.modpack !== current.modpack ||
      spec.modpack_version !== current.modpack_version ||
      spec.image_tag !== current.image_tag;

    return lockService.withLock(id, "update", async () => {
      const wasRunning = await this.isRunning(current);
      if (risky && !skipBackup) {
        progress(id, "Creando backup de seguridad antes de cambiar la versión…");
        const backupService = require("./backupService");
        const ok = await backupService.run(current, { reason: "pre-upgrade", onLog });
        if (!ok) throw new HttpError(500, "El backup previo falló; no se aplicaron cambios.");
      }
      q.update.run({ ...spec, id: current.id });
      const updated = this.getRow(id);
      if (beforeRecreate) {
        await this.stopRow(updated);
        await beforeRecreate(updated);
      }
      await this.recreate(updated, { start: wasRunning });
      progress(id, "Configuración aplicada.", { done: true });
      return this.toPublic(updated);
    });
  }

  async start(id) {
    const row = this.getRow(id);
    return lockService.withLock(id, "start", async () => {
      let info = await dockerService.inspect(row.container_name);
      if (!info) {
        await this.createContainer(row);
        info = await dockerService.inspect(row.container_name);
      }
      const container = dockerService.getContainer(row.container_name);
      // A crash loop disables the restart policy; restore it on manual start
      if (info.HostConfig.RestartPolicy?.Name !== "unless-stopped") {
        await container.update({ RestartPolicy: { Name: "unless-stopped", MaximumRetryCount: 0 } });
      }
      require("./serverMonitor").clearCrashloop(row.id);
      if (!info.State.Running) await container.start();
    });
  }

  async stop(id) {
    const row = this.getRow(id);
    return lockService.withLock(id, "stop", () => this.stopRow(row));
  }

  /** Stop without taking the lock (for callers that already hold it). */
  async stopRow(row) {
    const info = await dockerService.inspect(row.container_name);
    if (!info?.State?.Running && !info?.State?.Restarting) return false;
    require("./serverMonitor").expectStop(row.id);
    await dockerService.getContainer(row.container_name).stop({ t: 60 }).catch(ignoreNotRunning);
    return true;
  }

  async startRow(row) {
    const info = await dockerService.inspect(row.container_name);
    if (!info) await this.createContainer(row);
    await dockerService.getContainer(row.container_name).start().catch(ignoreNotRunning);
  }

  async restart(id) {
    const row = this.getRow(id);
    return lockService.withLock(id, "restart", async () => {
      await this.stopRow(row);
      await this.startRow(row);
    });
  }

  async isRunning(row) {
    const info = await dockerService.inspect(row.container_name);
    return Boolean(info?.State?.Running);
  }

  /**
   * Delete a server. Data is only deleted when it lives under SERVERS_ROOT
   * (an imported folder elsewhere is never removed automatically).
   */
  async remove(id, { deleteData = false, deleteBackups = false } = {}) {
    const row = this.getRow(id);
    return lockService.withLock(id, "delete", async () => {
      const info = await dockerService.inspect(row.container_name);
      if (info) {
        require("./serverMonitor").expectStop(row.id);
        await dockerService.getContainer(row.container_name).remove({ force: true });
      }
      require("./serverMonitor").forget(row.id);
      q.remove.run(row.id);

      let dataDeleted = false;
      if (deleteData && insideRoot(row.data_dir)) {
        await fs.promises.rm(path.dirname(row.data_dir), { recursive: true, force: true });
        dataDeleted = true;
      }
      if (deleteBackups) {
        await fs.promises.rm(path.join(config.backupsRoot, row.slug), { recursive: true, force: true });
      }
      realtime.emit("global", "server:removed", { serverId: row.id });
      return { dataDeleted, dataDir: row.data_dir };
    });
  }

  /**
   * Adopt an existing data folder (e.g. the legacy ./data from docker-compose).
   * @param {{name: string, dataDir: string, type: string, version: string, memory_mb: number, port: number,
   *          replaceContainer?: string}} input
   */
  async importExisting(input) {
    const dataDir = path.resolve(config.hostRepoRoot, input.dataDir);
    if (!fs.existsSync(dataDir)) throw new HttpError(400, `No existe la carpeta ${dataDir}.`);
    if (this.listRows().some((r) => r.data_dir === dataDir)) {
      throw new HttpError(409, "Esa carpeta ya está registrada en el panel.");
    }
    if (input.replaceContainer) {
      const legacy = await dockerService.inspect(input.replaceContainer);
      if (legacy) {
        await dockerService.getContainer(input.replaceContainer).remove({ force: true });
      }
    }
    // Keep the world the old server was using
    const props = readProperties(path.join(dataDir, "server.properties"));
    const env = { ...(input.env || {}) };
    if (!env.LEVEL && props["level-name"]) env.LEVEL = props["level-name"];
    if (!env.MOTD && props.motd) env.MOTD = props.motd;
    if (!env.MAX_PLAYERS && props["max-players"]) env.MAX_PLAYERS = props["max-players"];
    return this.create({ ...input, env }, { dataDir, start: input.start });
  }

  /**
   * Create a copy of a server (data folder copied, new port + container).
   * A running source is flushed with save-off/save-all while copying.
   */
  async clone(id, { name, port, allowOvercommit }) {
    const source = this.getRow(id);
    const rcon = require("./rconService");
    if (lockService.get(id)) throw new HttpError(409, "Hay otra operación en curso en el servidor origen.");
    const input = {
      ...source,
      name,
      port: port || undefined,
      map_port: null,
      env: parseEnv(source),
      allowOvercommit,
    };
    return this.create(input, {
      start: false,
      seed: async (dataDir) => {
        // The copy runs in the background, so the source lock is taken here
        await lockService.withLock(source.id, "clone", async () => {
          const running = await this.isRunning(source);
          if (running) {
            await rcon.tryExec(source, "save-off");
            await rcon.tryExec(source, "save-all flush");
          }
          try {
            await run("cp", ["-a", `${source.data_dir}/.`, dataDir]);
          } finally {
            if (running) await rcon.tryExec(source, "save-on");
          }
        });
        await this._copyModMetadata(source.id, dataDir);
      },
    });
  }

  /** Create a new server whose data comes from a backup archive. */
  async createFromBackup(id, backupName, { name, port, allowOvercommit }) {
    const source = this.getRow(id);
    const backupService = require("./backupService");
    const archive = backupService.resolveBackupPath(source, backupName);
    return this.create(
      { ...source, name, port: port || undefined, map_port: null, env: parseEnv(source), allowOvercommit },
      {
        start: false,
        seed: async (dataDir) => {
          await backupService.extractInto(archive, dataDir, parseEnv(source).LEVEL || "world");
        },
      }
    );
  }

  async _copyModMetadata(sourceId, dataDir) {
    const target = this.listRows().find((r) => r.data_dir === dataDir);
    if (!target) return;
    db.prepare(`
      INSERT OR REPLACE INTO mods (server_id, filename, sha1, project_id, version_id, title, version_number, icon_url)
      SELECT ?, filename, sha1, project_id, version_id, title, version_number, icon_url FROM mods WHERE server_id = ?
    `).run(target.id, sourceId);
  }

  /** Update only the env (e.g. switching the active world). */
  setEnvKey(id, key, value) {
    const row = this.getRow(id);
    const env = parseEnv(row);
    if (value === null) delete env[key];
    else env[key] = value;
    db.prepare("UPDATE servers SET env_json = ?, updated_at = datetime('now') WHERE id = ?").run(
      JSON.stringify(env),
      row.id
    );
    return this.getRow(id);
  }

  readProperties(row) {
    return readProperties(path.join(row.data_dir, "server.properties"));
  }
}

function readProperties(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx !== -1) out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

function ignoreNotRunning(err) {
  // 304: already stopped/started
  if (err.statusCode !== 304) throw err;
}

module.exports = new ServerService();
