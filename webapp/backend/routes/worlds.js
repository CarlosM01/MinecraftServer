const express = require("express");
const worldService = require("../services/worldService");
const auditService = require("../services/auditService");
const { asyncRoute, HttpError } = require("../httpError");
const { loadServer, upload } = require("../middleware/common");

const router = express.Router({ mergeParams: true });
router.use(loadServer);

const zipUpload = upload(20 * 1024 * 1024 * 1024).single("file");

/** Destructive world actions require typing the server name. */
function requireConfirm(req) {
  if (req.body?.confirm !== req.row.name) {
    throw new HttpError(400, "Escribe el nombre exacto del servidor para confirmar.");
  }
}

router.get("/", asyncRoute(async (req, res) => res.json(await worldService.list(req.row))));

router.post(
  "/upload",
  zipUpload,
  asyncRoute(async (req, res) => {
    if (!req.file) throw new HttpError(400, "Falta el archivo .zip.");
    const result = await worldService.upload(req.row, req.file.path, req.body.name);
    auditService.log(req, "world.upload", { serverId: req.row.id, target: req.body.name });
    res.status(201).json(result);
  })
);

router.post(
  "/new",
  asyncRoute(async (req, res) => {
    requireConfirm(req);
    const server = await worldService.createNew(req.row, req.body?.name);
    auditService.log(req, "world.create", { serverId: req.row.id, target: req.body?.name });
    res.json(server);
  })
);

router.get(
  "/:name/download",
  asyncRoute(async (req, res) => {
    auditService.log(req, "world.download", { serverId: req.row.id, target: req.params.name });
    await worldService.download(req.row, req.params.name, res);
  })
);

router.post(
  "/:name/activate",
  asyncRoute(async (req, res) => {
    requireConfirm(req);
    const server = await worldService.setActive(req.row, req.params.name);
    auditService.log(req, "world.activate", { serverId: req.row.id, target: req.params.name });
    res.json(server);
  })
);

router.post(
  "/:name/reset/:dimension",
  asyncRoute(async (req, res) => {
    requireConfirm(req);
    const result = await worldService.resetDimension(req.row, req.params.name, req.params.dimension);
    auditService.log(req, "world.reset_dimension", { serverId: req.row.id, target: req.params.name, details: result });
    res.json(result);
  })
);

router.delete(
  "/:name",
  asyncRoute(async (req, res) => {
    requireConfirm(req);
    await worldService.remove(req.row, req.params.name);
    auditService.log(req, "world.delete", { serverId: req.row.id, target: req.params.name });
    res.json({ ok: true });
  })
);

module.exports = router;
