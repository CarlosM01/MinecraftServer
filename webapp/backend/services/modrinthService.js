const config = require("../config");
const { HttpError } = require("../httpError");

const API = "https://api.modrinth.com/v2";

/** Loaders a plugin server can run, most specific first. */
const PLUGIN_LOADERS = {
  paper: ["paper", "spigot", "bukkit"],
  purpur: ["purpur", "paper", "spigot", "bukkit"],
};

async function request(pathname, { method = "GET", body, query } = {}) {
  const url = new URL(API + pathname);
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  const res = await fetch(url, {
    method,
    headers: {
      "User-Agent": config.modrinthUserAgent,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new HttpError(502, `Modrinth respondió HTTP ${res.status}`);
  return res.json();
}

/**
 * Minimal Modrinth API v2 client.
 */
const modrinthService = {
  /** Loader list to filter by for a given server loader ("fabric", "paper"…). */
  loadersFor(loader) {
    if (!loader) return [];
    return PLUGIN_LOADERS[loader] || [loader];
  },

  /**
   * Search projects compatible with a server.
   * @param {{query?: string, projectType: 'mod'|'plugin'|'modpack', loader?: string, gameVersion?: string,
   *          offset?: number, limit?: number}} opts
   */
  async search({ query = "", projectType, loader, gameVersion, offset = 0, limit = 20 }) {
    const facets = [];
    if (projectType === "plugin") facets.push(["project_type:plugin", "project_type:mod"]);
    else facets.push([`project_type:${projectType}`]);
    const loaders = this.loadersFor(loader);
    if (loaders.length) facets.push(loaders.map((l) => `categories:${l}`));
    if (gameVersion && gameVersion !== "LATEST") facets.push([`versions:${gameVersion}`]);
    if (projectType !== "modpack") facets.push(["server_side:required", "server_side:optional"]);
    const data = await request("/search", {
      query: { query, facets, offset: String(offset), limit: String(Math.min(limit, 50)), index: "relevance" },
    });
    return {
      total: data.total_hits,
      offset: data.offset,
      hits: data.hits.map((h) => ({
        projectId: h.project_id,
        slug: h.slug,
        title: h.title,
        description: h.description,
        author: h.author,
        downloads: h.downloads,
        iconUrl: h.icon_url,
        categories: h.display_categories || h.categories,
        versions: h.versions,
        serverSide: h.server_side,
      })),
    };
  },

  async project(idOrSlug) {
    return request(`/project/${encodeURIComponent(idOrSlug)}`);
  },

  async version(versionId) {
    return request(`/version/${encodeURIComponent(versionId)}`);
  },

  /** Versions of a project, optionally filtered by loader and game version. */
  async versions(idOrSlug, { loader, gameVersion } = {}) {
    const loaders = this.loadersFor(loader);
    const query = {};
    if (loaders.length) query.loaders = loaders;
    if (gameVersion && gameVersion !== "LATEST") query.game_versions = [gameVersion];
    return (await request(`/project/${encodeURIComponent(idOrSlug)}/version`, { query })) || [];
  },

  /** Best version for a server: first listed (Modrinth sorts newest first), preferring releases. */
  async bestVersion(idOrSlug, opts) {
    const list = await this.versions(idOrSlug, opts);
    return list.find((v) => v.version_type === "release") || list[0] || null;
  },

  /** Look up installed files by SHA-1. Returns { sha1: version }. */
  async versionsByHash(hashes) {
    if (!hashes.length) return {};
    return (await request("/version_files", { method: "POST", body: { hashes, algorithm: "sha1" } })) || {};
  },

  /** Latest compatible version for each hash. Returns { sha1: version }. */
  async updatesByHash(hashes, { loader, gameVersion }) {
    if (!hashes.length) return {};
    const body = { hashes, algorithm: "sha1", loaders: this.loadersFor(loader) };
    if (gameVersion && gameVersion !== "LATEST") body.game_versions = [gameVersion];
    return (await request("/version_files/update", { method: "POST", body })) || {};
  },

  async projects(ids) {
    if (!ids.length) return [];
    return (await request("/projects", { query: { ids } })) || [];
  },

  primaryFile(version) {
    return version.files.find((f) => f.primary) || version.files[0];
  },
};

module.exports = modrinthService;
