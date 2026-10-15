const express = require("express");
const backupService = require("../services/backupService");

const router = express.Router();

/**
 * GET /api/backups
 * Returns the list of available backups, active operation status, and in-memory log buffer.
 */
router.get("/", async (_req, res) => {
  try {
    const list = await backupService.listBackups();
    const status = backupService.getStatus();
    res.json({
      backups: list,
      operation: {
        activeOp: status.activeOp,
        status: status.status,
        logs: status.logs,
      },
    });
  } catch (err) {
    console.error("[GET /api/backups] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/backups
 * Trigger a new backup process using the automated backup python script.
 */
router.post("/", (req, res) => {
  try {
    backupService.triggerBackup();
    res.status(202).json({ message: "Backup operation initiated successfully." });
  } catch (err) {
    console.error("[POST /api/backups] Error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/backups/:name/restore
 * Overwrite the active world save folder with the content of the selected backup.
 */
router.post("/:name/restore", (req, res) => {
  const { name } = req.params;
  try {
    backupService.triggerRestore(name);
    res.status(202).json({ message: `Restore operation for '${name}' initiated successfully.` });
  } catch (err) {
    console.error(`[POST /api/backups/${name}/restore] Error:`, err.message);
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/backups/:name/test
 * Launch the test server to verify the integrity and loading of the selected backup.
 */
router.post("/:name/test", (req, res) => {
  const { name } = req.params;
  try {
    backupService.triggerTest(name);
    res.status(202).json({ message: `Test verification for '${name}' initiated successfully.` });
  } catch (err) {
    console.error(`[POST /api/backups/${name}/test] Error:`, err.message);
    res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /api/backups/:name
 * Permanently delete the backup archive from the disk.
 */
router.delete("/:name", async (req, res) => {
  const { name } = req.params;
  try {
    await backupService.deleteBackup(name);
    res.json({ message: `Backup '${name}' deleted successfully.` });
  } catch (err) {
    console.error(`[DELETE /api/backups/${name}] Error:`, err.message);
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
