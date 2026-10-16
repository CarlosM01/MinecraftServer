/**
 * Pure parsers for Minecraft console output. Kept free of I/O so they can
 * be unit-tested with real log lines (see scripts/test.js).
 */

const NAME = "([A-Za-z0-9_.*-]{1,20})";

/**
 * Extract the message part of a console line. Handles:
 *   Vanilla/Fabric: [12:00:00] [Server thread/INFO]: msg
 *   Paper:          [12:00:00 INFO]: msg
 *   Forge/NeoForge: [12:00:00] [Server thread/INFO] [minecraft/MinecraftServer]: msg
 *   Forge (new):    [01Jan2026 12:00:00.000] [Server thread/INFO] [net.minecraft.server.MinecraftServer/]: msg
 */
function messageOf(line) {
  const m = line.match(/^(?:\[[^\]]*\]\s*)+:\s?(.*)$/);
  return m ? m[1] : null;
}

const RE = {
  join: new RegExp(`^${NAME} (?:\\(formerly known as \\S+\\) )?joined the game$`),
  leave: new RegExp(`^${NAME} left the game$`),
  uuid: new RegExp(`^UUID of player ${NAME} is ([0-9a-f-]{32,36})$`, "i"),
  login: new RegExp(`^${NAME}\\[/?([^\\]]+?)(?::\\d+)?\\] logged in with entity id`),
  done: /^Done \([\d.,]+s\)! For help, type "help"/,
  chunky:
    /Task (?:running|finished) for (\S+)\. (?:Processed|Chunks): (\d+) chunks \(([\d.,]+)%\)(?:, ETA: ([\d:]+))?(?:, Rate: ([\d.,]+) cps)?/,
  chunkyDone: /Task finished for (\S+)\./,
};

/**
 * Classify a (clean, ANSI-free) console line.
 * @returns {null | {type: 'join'|'leave'|'uuid'|'login'|'done'|'chunky', ...}}
 */
function parseConsoleLine(line) {
  const msg = messageOf(line);
  if (msg === null) return null;
  // Chat lines (<name> text) and broadcasts ([Server] text) can never be events
  if (msg.startsWith("<") || msg.startsWith("[Server]")) return null;

  let m;
  if ((m = msg.match(RE.join))) return { type: "join", name: m[1] };
  if ((m = msg.match(RE.leave))) return { type: "leave", name: m[1] };
  if ((m = msg.match(RE.uuid))) return { type: "uuid", name: m[1], uuid: normaliseUuid(m[2]) };
  if ((m = msg.match(RE.login))) return { type: "login", name: m[1], ip: m[2] };
  if (RE.done.test(msg)) return { type: "done" };
  if ((m = msg.match(RE.chunky))) {
    return {
      type: "chunky",
      world: m[1],
      chunks: parseInt(m[2], 10),
      percent: parseFloat(m[3].replace(",", ".")),
      eta: m[4] || null,
      rate: m[5] ? parseFloat(m[5].replace(",", ".")) : null,
      finished: /Task finished/.test(msg),
    };
  }
  if ((m = msg.match(RE.chunkyDone))) {
    return { type: "chunky", world: m[1], percent: 100, finished: true };
  }
  return null;
}

function normaliseUuid(u) {
  const hex = u.replace(/-/g, "").toLowerCase();
  if (hex.length !== 32) return u.toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Parse the response of the `list` command.
 *   Vanilla/new Paper: "There are 2 of a max of 20 players online: Steve, Alex"
 *   Old Paper/Spigot:  "There are 2 out of maximum 20 players online.\ndefault: Steve, Alex"
 * @returns {{count: number, max: number, names: string[]} | null}
 */
function parseListResponse(text) {
  const m = text.match(/There are (\d+) (?:of a max of|out of maximum|\/) ?(\d+) players online[.:]?/i);
  if (!m) return null;
  const count = parseInt(m[1], 10);
  const max = parseInt(m[2], 10);
  let names = [];
  const rest = text.slice(m.index + m[0].length);
  const firstLine = rest.split("\n")[0].trim();
  if (firstLine) {
    names = splitNames(firstLine);
  } else {
    // Group format: one "group: a, b" per line
    for (const line of rest.split("\n").slice(1)) {
      const idx = line.indexOf(":");
      if (idx !== -1) names.push(...splitNames(line.slice(idx + 1)));
    }
  }
  return { count, max, names: names.slice(0, count || names.length) };
}

function splitNames(str) {
  return str
    .split(",")
    .map((s) => s.trim().replace(/^\[[^\]]*\]\s*/, "").replace(/\s*\(.*\)$/, ""))
    .filter((s) => /^[A-Za-z0-9_.*-]{1,20}$/.test(s));
}

/**
 * Parse TPS/MSPT from whichever command the server supports.
 * @param {'paper'|'spark'|'tick'} kind
 * @returns {{tps: number|null, mspt: number|null}}
 */
function parseTps(kind, text) {
  const num = (s) => parseFloat(String(s).replace(/[^\d.]/g, ""));
  if (kind === "paper") {
    // "TPS from last 1m, 5m, 15m: 20.0, 20.0, 19.98"  (may be prefixed with *)
    const m = text.match(/TPS from last[^:]*:\s*\*?([\d.]+)/i);
    return { tps: m ? Math.min(20, num(m[1])) : null, mspt: null };
  }
  if (kind === "paper-mspt") {
    // "Server tick times (avg/min/max) from last 5s, 10s, 1m:\n◴ 1.2/0.9/3.4, ..."
    const m = text.match(/from last[^:]*:\s*\S*\s*([\d.]+)\//i);
    return { tps: null, mspt: m ? num(m[1]) : null };
  }
  if (kind === "spark") {
    const t = text.match(/TPS from last[^:]*:\s*\*?([\d.]+)/i);
    // "Tick durations (min/med/95%ile/max ms) from last 10s, 1m:\n 1.0/2.0/3.0/9.0; ..."
    const d = text.match(/Tick durations[^:]*:\s*([\d.]+)\/([\d.]+)\//i);
    return { tps: t ? Math.min(20, num(t[1])) : null, mspt: d ? num(d[2]) : null };
  }
  if (kind === "tick") {
    // Vanilla 1.20.3+: "Average time per tick: 1.2ms (Target: 50.0ms)"
    const m = text.match(/Average time per tick:\s*([\d.]+)\s*ms/i);
    if (!m) return { tps: null, mspt: null };
    const mspt = num(m[1]);
    const target = text.match(/Target tick rate:\s*([\d.]+)/i);
    const rate = target ? num(target[1]) : 20;
    return { tps: Math.round(Math.min(rate, 1000 / Math.max(mspt, 0.001)) * 100) / 100, mspt };
  }
  return { tps: null, mspt: null };
}

module.exports = { messageOf, parseConsoleLine, parseListResponse, parseTps, normaliseUuid };
