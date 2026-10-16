const express = require("express");
const backupService = require("../services/backupService");
const auditService = require("../services/auditService");
const { asyncRoute, HttpError } = require("../httpError");
const { loadServer } = require("../middleware/common");

const router = express.Router({ mergeParams: true });
router.use(loadServer);

/**
 * GET /api/servers/:id/backups
 * Backups of this server plus the current operation status and log buffer.
 */
router.get(
  "/",
  asyncRoute(async (req, res) => {
    res.json({ backups: await backupService.list(req.row), operation: backupService.getStatus(req.row) });
  })
);

/** POST /api/servers/:id/backups — start a backup in the background. */
router.post("/", (req, res) => {
  try {
    backupService.triggerBackup(req.row);
    auditService.log(req, "backup.create", { serverId: req.row.id, target: req.row.name });
    res.status(202).json({ message: "Backup iniciado." });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

/** POST /api/servers/:id/backups/:name/restore — overwrite the server data. */
router.post("/:name/restore", (req, res) => {
  try {
    if (req.body?.confirm !== req.row.name) {
      throw new HttpError(400, "Escribe el nombre exacto del servidor para confirmar.");
    }
    backupService.triggerRestore(req.row, req.params.name);
    auditService.log(req, "backup.restore", { serverId: req.row.id, target: req.params.name });
    res.status(202).json({ message: `Restaurando '${req.params.name}'.` });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

/** POST /api/servers/:id/backups/:name/test — boot a temporary test server. */
router.post("/:name/test", (req, res) => {
  try {
    backupService.triggerTest(req.row, req.params.name);
    auditService.log(req, "backup.test", { serverId: req.row.id, target: req.params.name });
    res.status(202).json({ message: `Verificando '${req.params.name}'.` });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

router.post("/logs/clear", (req, res) => {
  backupService.clearLogs(req.row);
  res.json({ ok: true });
});

/** DELETE /api/servers/:id/backups/:name */
router.delete(
  "/:name",
  asyncRoute(async (req, res) => {
    await backupService.remove(req.row, req.params.name);
    auditService.log(req, "backup.delete", { serverId: req.row.id, target: req.params.name });
    res.json({ message: `Backup '${req.params.name}' eliminado.` });
  })
);

module.exports = router;
