const realtime = require("../realtime");
const monitor = require("./serverMonitor");
const rconService = require("./rconService");
const { HttpError } = require("../httpError");

/**
 * Chunk pre-generation through the Chunky mod/plugin. Commands go over
 * RCON; progress is parsed from Chunky's periodic console messages.
 */
class PregenService {
  constructor() {
    this.progress = new Map(); // serverId -> last progress event
  }

  init() {
    monitor.on("line", (id, _line, evt) => {
      if (evt?.type !== "chunky") return;
      const payload = { serverId: id, ...evt, ts: new Date().toISOString() };
      this.progress.set(id, payload);
      realtime.emit(`server:${id}`, "pregen:progress", payload);
    });
  }

  installed(row) {
    return require("./modService").hasJar(row, "chunky");
  }

  /** Chunky world id for a dimension on this platform. */
  worldId(row, dimension) {
    const worldService = require("./worldService");
    const level = worldService.activeLevel(row);
    if (worldService.splitDimensions(row)) {
      return { overworld: level, nether: `${level}_nether`, end: `${level}_the_end` }[dimension];
    }
    return { overworld: "minecraft:overworld", nether: "minecraft:the_nether", end: "minecraft:the_end" }[dimension];
  }

  status(row) {
    return { installed: this.installed(row), progress: this.progress.get(row.id) || null };
  }

  async start(row, { dimension = "overworld", radius, centerX = 0, centerZ = 0, shape = "square" }) {
    if (!this.installed(row)) throw new HttpError(400, "Chunky no está instalado en este servidor.");
    if (!monitor.isOnline(row.id)) throw new HttpError(409, "El servidor debe estar en línea.");
    const r = parseInt(radius, 10);
    if (!(r >= 16 && r <= 100000)) throw new HttpError(400, "Radio inválido (16-100000 bloques).");
    const x = parseInt(centerX, 10) || 0;
    const z = parseInt(centerZ, 10) || 0;
    if (!["square", "circle"].includes(shape)) throw new HttpError(400, "Forma inválida.");
    const world = this.worldId(row, dimension);
    if (!world) throw new HttpError(400, "Dimensión inválida.");

    const out = [];
    for (const cmd of [`chunky world ${world}`, `chunky shape ${shape}`, `chunky center ${x} ${z}`, `chunky radius ${r}`, "chunky start"]) {
      out.push(await rconService.exec(row, cmd));
    }
    this.progress.set(row.id, { serverId: row.id, world, percent: 0, finished: false, ts: new Date().toISOString() });
    return out.join("\n");
  }

  async control(row, action) {
    const cmds = { pause: ["chunky pause"], continue: ["chunky continue"], cancel: ["chunky cancel", "chunky confirm"] };
    if (!cmds[action]) throw new HttpError(400, "Acción inválida.");
    const out = [];
    for (const cmd of cmds[action]) out.push(await rconService.exec(row, cmd));
    if (action === "cancel") this.progress.delete(row.id);
    return out.join("\n");
  }
}

module.exports = new PregenService();
