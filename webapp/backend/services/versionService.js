const CACHE_MS = 60 * 60 * 1000;
const cache = new Map(); // key -> { at, data }

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

async function cached(key, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  const data = await loader();
  cache.set(key, { at: Date.now(), data });
  return data;
}

/** Sort "1.21.4", "1.20.10", "26.1" … newest first. */
function sortVersionsDesc(list) {
  const parts = (v) => v.split(/[.-]/).map((p) => (/^\d+$/.test(p) ? parseInt(p, 10) : -1));
  return [...new Set(list)].sort((a, b) => {
    const pa = parts(a);
    const pb = parts(b);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pb[i] ?? 0) - (pa[i] ?? 0);
      if (d) return d;
    }
    return 0;
  });
}

const loaders = {
  async VANILLA({ snapshots }) {
    const data = await getJson("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json");
    return data.versions.filter((v) => v.type === "release" || (snapshots && v.type === "snapshot")).map((v) => v.id);
  },
  async PAPER() {
    const data = await getJson("https://fill.papermc.io/v3/projects/paper");
    return sortVersionsDesc(Object.values(data.versions || {}).flat()).filter((v) => !/-(pre|rc)/i.test(v));
  },
  async PURPUR() {
    const data = await getJson("https://api.purpurmc.org/v2/purpur");
    return sortVersionsDesc(data.versions || []);
  },
  async FABRIC({ snapshots }) {
    const data = await getJson("https://meta.fabricmc.net/v2/versions/game");
    return data.filter((v) => snapshots || v.stable).map((v) => v.version);
  },
  async QUILT({ snapshots }) {
    const data = await getJson("https://meta.quiltmc.org/v3/versions/game");
    return data.filter((v) => snapshots || v.stable).map((v) => v.version);
  },
  async FORGE() {
    const data = await getJson("https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json");
    return sortVersionsDesc(Object.keys(data.promos || {}).map((k) => k.replace(/-(latest|recommended)$/, "")));
  },
  async NEOFORGE() {
    const data = await getJson(
      "https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge"
    );
    // NeoForge "21.1.77" targets MC 1.21.1; "26.1.0.x" targets MC 26.1
    const mc = (data.versions || [])
      .filter((v) => !/beta|alpha/i.test(v))
      .map((v) => {
        const [major, minor] = v.split(".").map((n) => parseInt(n, 10));
        if (major >= 26) return `${major}.${minor}`;
        return minor > 0 ? `1.${major}.${minor}` : `1.${major}`;
      });
    return sortVersionsDesc(mc);
  },
};

/**
 * Lists the Minecraft versions available for each server type, from the
 * upstream metadata APIs (cached for an hour).
 */
const versionService = {
  async list(type, { snapshots = false } = {}) {
    const key = String(type || "").toUpperCase();
    const loader = loaders[key === "MODRINTH" ? "VANILLA" : key];
    if (!loader) return { versions: [], error: `Tipo desconocido: ${type}` };
    try {
      const versions = await cached(`${key}:${snapshots}`, () => loader({ snapshots }));
      return { versions };
    } catch (err) {
      // The UI still lets the user type a version manually
      return { versions: [], error: `No se pudo obtener la lista de versiones: ${err.message}` };
    }
  },
};

module.exports = versionService;
