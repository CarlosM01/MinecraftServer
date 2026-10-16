const express = require("express");
const versionService = require("../services/versionService");
const hostService = require("../services/hostService");
const auditService = require("../services/auditService");
const modrinthService = require("../services/modrinthService");
const modpackService = require("../services/modpackService");
const serverService = require("../services/serverService");
const dockerService = require("../services/dockerService");
const realtime = require("../realtime");
const config = require("../config");
const { asyncRoute, HttpError } = require("../httpError");

const router = express.Router();

/** GET /api/meta — static options for the UI forms. */
router.get("/meta", (_req, res) => {
  res.json({
    types: serverService.SERVER_TYPES,
    gameEnvKeys: serverService.GAME_ENV_KEYS,
    imageTags: serverService.IMAGE_TAGS,
  });
});

/** GET /api/versions/:type?snapshots=1 */
router.get(
  "/versions/:type",
  asyncRoute(async (req, res) => {
    res.json(await versionService.list(req.params.type, { snapshots: req.query.snapshots === "1" }));
  })
);

/** GET /api/host — host capacity and allocation. */
router.get("/host", asyncRoute(async (_req, res) => res.json(await hostService.summary())));

/** GET /api/audit?serverId=&action=&q=&before= */
router.get("/audit", (req, res) => {
  res.json(
    auditService.list({
      serverId: req.query.serverId ? Number(req.query.serverId) : undefined,
      action: req.query.action || undefined,
      q: req.query.q || undefined,
      before: req.query.before ? Number(req.query.before) : undefined,
      limit: parseInt(req.query.limit || "200", 10),
    })
  );
});

/** GET /api/modpacks/search?q=&offset= */
router.get(
  "/modpacks/search",
  asyncRoute(async (req, res) => {
    res.json(
      await modrinthService.search({
        query: req.query.q || "",
        projectType: "modpack",
        offset: parseInt(req.query.offset || "0", 10),
      })
    );
  })
);

/** GET /api/modpacks/:id — versions of a modpack with their MC version/loader. */
router.get(
  "/modpacks/:id",
  asyncRoute(async (req, res) => {
    const info = await modpackService.inspectProject(req.params.id);
    const versions = (await modrinthService.versions(info.projectId)).slice(0, 50).map((v) => ({
      id: v.id,
      versionNumber: v.version_number,
      gameVersions: v.game_versions,
      loaders: v.loaders,
      type: v.version_type,
      published: v.date_published,
    }));
    res.json({ ...info, versions });
  })
);

/** GET /api/images — local tags of the Minecraft image. */
router.get(
  "/images",
  asyncRoute(async (_req, res) => {
    const images = await dockerService.docker.listImages({ filters: { reference: [config.mcImageRepo] } });
    res.json(
      images.flatMap((img) =>
        (img.RepoTags || []).map((tag) => ({ tag: tag.split(":")[1], created: new Date(img.Created * 1000).toISOString(), size: img.Size }))
      )
    );
  })
);

/**
 * POST /api/images/pull { tag } — update an image tag in the background.
 * Progress goes to the "global" room as "image:progress". Containers pick
 * up the new image when they are recreated (Settings → save, or recreate).
 */
let pulling = false;
router.post("/images/pull", (req, res) => {
  const tag = String(req.body?.tag || "latest");
  if (!serverService.IMAGE_TAGS.includes(tag)) throw new HttpError(400, "Tag inválido.");
  if (pulling) return res.status(409).json({ error: "Ya hay una descarga en curso." });
  pulling = true;
  const image = `${config.mcImageRepo}:${tag}`;
  const emit = (message, extra = {}) => realtime.emit("global", "image:progress", { image, message, ...extra });
  dockerService.docker
    .pull(image)
    .then(
      (stream) =>
        new Promise((resolve, reject) => {
          let last = 0;
          dockerService.docker.modem.followProgress(
            stream,
            (err) => (err ? reject(err) : resolve()),
            (evt) => {
              if (Date.now() - last > 1500 && evt.status) {
                last = Date.now();
                emit(`${evt.status}${evt.progress ? " " + evt.progress : ""}`);
              }
            }
          );
        })
    )
    .then(() => emit(`${image} actualizada.`, { done: true }))
    .catch((err) => emit(`Error: ${err.message}`, { done: true, error: true }))
    .finally(() => {
      pulling = false;
    });
  auditService.log(req, "image.pull", { target: image });
  res.status(202).json({ image });
});

module.exports = router;
