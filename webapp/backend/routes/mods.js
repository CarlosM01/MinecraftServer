const express = require("express");
const modService = require("../services/modService");
const auditService = require("../services/auditService");
const { asyncRoute } = require("../httpError");
const { loadServer, upload } = require("../middleware/common");

const router = express.Router({ mergeParams: true });
router.use(loadServer);

const jarUpload = upload(256 * 1024 * 1024).single("file");

router.get("/", asyncRoute(async (req, res) => res.json(await modService.list(req.row))));

router.post(
  "/upload",
  jarUpload,
  asyncRoute(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Falta el archivo." });
    const name = await modService.upload(req.row, req.file.path, req.file.originalname);
    auditService.log(req, "mod.upload", { serverId: req.row.id, target: name });
    res.status(201).json({ filename: name });
  })
);

router.get(
  "/search",
  asyncRoute(async (req, res) =>
    res.json(await modService.search(req.row, { query: req.query.q || "", offset: parseInt(req.query.offset || "0", 10) }))
  )
);

router.get(
  "/project/:projectId/versions",
  asyncRoute(async (req, res) => res.json(await modService.compatibleVersions(req.row, req.params.projectId)))
);

router.post(
  "/install",
  asyncRoute(async (req, res) => {
    const { projectId, versionId } = req.body || {};
    const installed = await modService.install(req.row, projectId, versionId);
    auditService.log(req, "mod.install", { serverId: req.row.id, target: projectId, details: { installed } });
    res.status(201).json({ installed });
  })
);

router.get("/updates", asyncRoute(async (req, res) => res.json(await modService.checkUpdates(req.row))));

router.post(
  "/:filename/toggle",
  asyncRoute(async (req, res) => {
    const filename = await modService.toggle(req.row, req.params.filename, Boolean(req.body?.enabled));
    auditService.log(req, req.body?.enabled ? "mod.enable" : "mod.disable", { serverId: req.row.id, target: filename });
    res.json({ filename });
  })
);

router.delete(
  "/:filename",
  asyncRoute(async (req, res) => {
    await modService.remove(req.row, req.params.filename);
    auditService.log(req, "mod.delete", { serverId: req.row.id, target: req.params.filename });
    res.json({ ok: true });
  })
);

module.exports = router;
