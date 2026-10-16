const fs = require("fs");
const express = require("express");
const serverService = require("../services/serverService");
const modService = require("../services/modService");
const modpackService = require("../services/modpackService");
const metricsService = require("../services/metricsService");
const hostService = require("../services/hostService");
const terminalService = require("../services/terminalService");
const pregenService = require("../services/pregenService");
const auditService = require("../services/auditService");
const lockService = require("../services/lockService");
const { asyncRoute, HttpError } = require("../httpError");
const { loadServer, upload } = require("../middleware/common");

const router = express.Router();
const mrpackUpload = upload(1024 * 1024 * 1024).single("modpack");

/** Accept JSON or multipart (with optional .mrpack) for create. */
function parseBody(req) {
  if (typeof req.body?.payload === "string") return JSON.parse(req.body.payload);
  return req.body || {};
}

/* ── Collection ────────────────────────────────────────────── */

router.get("/", (_req, res) => res.json(serverService.list()));

router.post(
  "/",
  mrpackUpload,
  asyncRoute(async (req, res) => {
    const body = parseBody(req);
    let modpackFile = null;
    try {
      if (req.file) {
        // Uploaded modpack: take MC version + loader from its index
        const info = await modpackService.inspectFile(req.file.path);
        Object.assign(body, {
          type: "MODRINTH",
          modpack: "/data/modpack.mrpack",
          version: body.version && body.version !== "LATEST" ? body.version : info.gameVersion || "LATEST",
          loader: info.loader,
        });
        modpackFile = req.file.path;
      } else if (body.type === "MODRINTH" && body.modpack) {
        const info = await modpackService.inspectProject(body.modpack, body.modpack_version);
        Object.assign(body, {
          modpack: info.slug,
          version: info.gameVersion || "LATEST",
          loader: info.loader,
        });
      }
      const server = await serverService.create(body, { modpackFile, start: body.start !== false });
      auditService.log(req, "server.create", { serverId: server.id, target: server.name, details: { type: server.type, version: server.version } });
      res.status(201).json(server);
    } catch (err) {
      if (req.file) fs.rm(req.file.path, { force: true }, () => {});
      throw err;
    }
  })
);

router.post(
  "/import",
  asyncRoute(async (req, res) => {
    const server = await serverService.importExisting(req.body);
    auditService.log(req, "server.import", { serverId: server.id, target: server.name, details: { dataDir: server.data_dir } });
    res.status(201).json(server);
  })
);

router.get(
  "/next-port",
  asyncRoute(async (_req, res) => res.json({ port: await serverService.nextFreePort() }))
);

/* ── Single server ─────────────────────────────────────────── */

router.use("/:id", loadServer);

router.get("/:id", (req, res) => res.json(serverService.toPublic(req.row)));

router.put(
  "/:id",
  asyncRoute(async (req, res) => {
    const server = await serverService.update(req.row.id, req.body);
    auditService.log(req, "server.update", { serverId: server.id, target: server.name, details: req.body });
    res.json(server);
  })
);

router.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    const { confirm, deleteData, deleteBackups } = req.body || {};
    if (confirm !== req.row.name) throw new HttpError(400, "Escribe el nombre exacto del servidor para confirmar.");
    const result = await serverService.remove(req.row.id, { deleteData, deleteBackups });
    auditService.log(req, "server.delete", { serverId: req.row.id, target: req.row.name, details: { deleteData, deleteBackups, ...result } });
    res.json(result);
  })
);

for (const action of ["start", "stop", "restart"]) {
  router.post(
    `/:id/${action}`,
    asyncRoute(async (req, res) => {
      await serverService[action](req.row.id);
      auditService.log(req, `server.${action}`, { serverId: req.row.id, target: req.row.name });
      res.json({ ok: true });
    })
  );
}

router.post(
  "/:id/recreate",
  asyncRoute(async (req, res) => {
    await lockService.withLock(req.row.id, "recreate", () => serverService.recreate(req.row));
    auditService.log(req, "server.recreate", { serverId: req.row.id, target: req.row.name });
    res.json({ ok: true });
  })
);

router.post(
  "/:id/clone",
  asyncRoute(async (req, res) => {
    const server = await serverService.clone(req.row.id, req.body || {});
    auditService.log(req, "server.clone", { serverId: server.id, target: server.name, details: { from: req.row.name } });
    res.status(201).json(server);
  })
);

router.post(
  "/:id/from-backup",
  asyncRoute(async (req, res) => {
    const { backup, ...rest } = req.body || {};
    const server = await serverService.createFromBackup(req.row.id, backup, rest);
    auditService.log(req, "server.from_backup", { serverId: server.id, target: server.name, details: { from: req.row.name, backup } });
    res.status(201).json(server);
  })
);

/* ── Console (REST fallback; the UI uses sockets) ──────────── */

router.post(
  "/:id/command",
  asyncRoute(async (req, res) => {
    terminalService.send(req.row, req.body?.command, req);
    res.json({ ok: true });
  })
);

/* ── Health / resources ────────────────────────────────────── */

router.get(
  "/:id/metrics",
  asyncRoute(async (req, res) => {
    res.json({ ...metricsService.query(req.row.id, req.query.range), latestTps: metricsService.latestTps(req.row.id) });
  })
);

router.get(
  "/:id/disk",
  asyncRoute(async (req, res) => res.json(await hostService.serverDisk(req.row, { fresh: req.query.fresh === "1" })))
);

router.get(
  "/:id/crash-reports",
  asyncRoute(async (req, res) => res.json(await hostService.crashReports(req.row)))
);

router.get(
  "/:id/crash-reports/:name",
  asyncRoute(async (req, res) => res.type("text/plain").send(await hostService.crashReport(req.row, req.params.name)))
);

/* ── Version upgrades with mod compatibility ───────────────── */

router.post(
  "/:id/upgrade-check",
  asyncRoute(async (req, res) => {
    const { type, version, loader } = req.body || {};
    res.json(await modService.upgradeCheck(req.row, { type, version, loader }));
  })
);

/**
 * Body: { type?, version, updateMods: bool, disableIncompatible: bool }
 * Backup → save config → swap mods (server stopped) → recreate container.
 */
router.post(
  "/:id/upgrade",
  asyncRoute(async (req, res) => {
    const { type, version, updateMods = true, disableIncompatible = false } = req.body || {};
    const target = { type: type || req.row.type, version };
    const report = updateMods ? await modService.upgradeCheck(req.row, target) : null;
    let modLog = [];
    const server = await serverService.update(req.row.id, target, {
      beforeRecreate: async (updated) => {
        if (report && serverService.contentKind(updated)) {
          modLog = await modService.applyUpgradeReport(updated, report, { disableIncompatible });
        }
      },
    });
    auditService.log(req, "server.upgrade", { serverId: req.row.id, target: req.row.name, details: { from: req.row.version, to: version, modLog } });
    res.json({ server, modLog });
  })
);

/* ── Chunk pre-generation (Chunky) ─────────────────────────── */

router.get("/:id/pregen", (req, res) => res.json(pregenService.status(req.row)));

router.post(
  "/:id/pregen",
  asyncRoute(async (req, res) => {
    const output = await pregenService.start(req.row, req.body || {});
    auditService.log(req, "pregen.start", { serverId: req.row.id, target: req.row.name, details: req.body });
    res.json({ output });
  })
);

router.post(
  "/:id/pregen/:action",
  asyncRoute(async (req, res) => {
    const output = await pregenService.control(req.row, req.params.action);
    auditService.log(req, `pregen.${req.params.action}`, { serverId: req.row.id, target: req.row.name });
    res.json({ output });
  })
);

module.exports = router;
