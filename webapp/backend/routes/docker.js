const express = require("express");
const dockerService = require("../services/dockerService");

const router = express.Router();

/**
 * GET /api/docker/stats
 * Returns a one-shot stats snapshot for the Minecraft container.
 */
router.get("/stats", async (_req, res) => {
  try {
    const stats = await dockerService.getStats();
    res.json(stats);
  } catch (err) {
    console.error("[GET /api/docker/stats] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/docker/info
 * Returns basic container metadata: name, status, image, startedAt.
 */
router.get("/info", async (_req, res) => {
  try {
    const info = await dockerService.getInfo();
    res.json(info);
  } catch (err) {
    console.error("[GET /api/docker/info] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
