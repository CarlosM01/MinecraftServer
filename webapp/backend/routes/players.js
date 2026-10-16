const express = require("express");
const playerService = require("../services/playerService");
const auditService = require("../services/auditService");
const { asyncRoute } = require("../httpError");
const { loadServer } = require("../middleware/common");

/* ── /api/players (global) ─────────────────────────────────── */

const globalRouter = express.Router();

globalRouter.get("/", (req, res) => {
  res.json(playerService.allPlayers({ serverId: req.query.serverId ? Number(req.query.serverId) : undefined }));
});

globalRouter.get("/:uuid", (req, res) => {
  try {
    res.json(playerService.player(req.params.uuid));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/* ── /api/servers/:id/players ──────────────────────────────── */

const serverRouter = express.Router({ mergeParams: true });
serverRouter.use(loadServer);

serverRouter.get("/", (req, res) => {
  res.json({ online: playerService.getOnline(req.row.id), max: playerService.maxPlayers(req.row.id) });
});

serverRouter.get("/history", (req, res) => {
  res.json(playerService.sessions({ serverId: req.row.id, limit: parseInt(req.query.limit || "100", 10) }));
});

serverRouter.get("/known", (req, res) => {
  res.json(playerService.allPlayers({ serverId: req.row.id }));
});

serverRouter.get("/lists", (req, res) => res.json(playerService.lists(req.row)));

serverRouter.post(
  "/:name/:action",
  asyncRoute(async (req, res) => {
    const { name, action } = req.params;
    const output = await playerService.action(req.row, action, name, req.body?.reason);
    auditService.log(req, `player.${action}`, { serverId: req.row.id, target: name, details: req.body?.reason || null });
    // ops/whitelist files change after the command; refresh the online list too
    setTimeout(() => playerService.reconcile(req.row.id).catch(() => {}), 500);
    res.json({ output });
  })
);

module.exports = { globalRouter, serverRouter };
