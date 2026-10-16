const yauzl = require("yauzl");
const modrinth = require("./modrinthService");
const { HttpError } = require("../httpError");

/** Dependency keys used in modrinth.index.json → Modrinth loader name. */
const LOADER_KEYS = {
  "fabric-loader": "fabric",
  "quilt-loader": "quilt",
  forge: "forge",
  neoforge: "neoforge",
};

function readIndex(file) {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(new HttpError(400, "El archivo no es un .mrpack válido."));
      let found = false;
      zip.on("entry", (entry) => {
        if (entry.fileName !== "modrinth.index.json") return zip.readEntry();
        found = true;
        zip.openReadStream(entry, (e, stream) => {
          if (e) return reject(e);
          let data = "";
          stream.on("data", (c) => {
            data += c;
            if (data.length > 5 * 1024 * 1024) stream.destroy(new Error("modrinth.index.json demasiado grande"));
          });
          stream.on("end", () => {
            zip.close();
            try {
              resolve(JSON.parse(data));
            } catch {
              reject(new HttpError(400, "modrinth.index.json inválido."));
            }
          });
          stream.on("error", reject);
        });
      });
      zip.on("end", () => !found && reject(new HttpError(400, "Falta modrinth.index.json en el .mrpack.")));
      zip.readEntry();
    });
  });
}

/**
 * Resolves Minecraft version + loader of a Modrinth modpack, either from the
 * Modrinth API (slug/ID) or from an uploaded .mrpack file.
 */
const modpackService = {
  async inspectProject(idOrSlug, versionId) {
    const project = await modrinth.project(idOrSlug);
    if (!project || project.project_type !== "modpack") throw new HttpError(404, "Modpack no encontrado en Modrinth.");
    const version = versionId
      ? await modrinth.version(versionId)
      : (await modrinth.versions(project.id)).find((v) => v.version_type === "release") || null;
    if (!version) throw new HttpError(404, "El modpack no tiene versiones publicadas.");
    const loader = version.loaders.find((l) => Object.values(LOADER_KEYS).includes(l)) || version.loaders[0];
    return {
      projectId: project.id,
      slug: project.slug,
      title: project.title,
      iconUrl: project.icon_url,
      versionId: version.id,
      versionNumber: version.version_number,
      gameVersion: version.game_versions[0],
      loader,
    };
  },

  async inspectFile(file) {
    const index = await readIndex(file);
    const deps = index.dependencies || {};
    const loaderKey = Object.keys(LOADER_KEYS).find((k) => deps[k]);
    return {
      title: index.name,
      versionNumber: index.versionId,
      gameVersion: deps.minecraft,
      loader: loaderKey ? LOADER_KEYS[loaderKey] : null,
    };
  },
};

module.exports = modpackService;
