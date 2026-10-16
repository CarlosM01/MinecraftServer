#!/usr/bin/env node
/**
 * Panel backend test script.
 *
 *   node scripts/test.js           unit tests (parsers) + module loading
 *   node scripts/test.js --live    end-to-end against a running backend and Docker:
 *                                  login → create Paper server → wait online → RCON list →
 *                                  Modrinth plugin install → restart → delete
 *
 * Live mode env: PANEL_URL (default http://localhost:3001), ADMIN_PASSWORD.
 */
const assert = require("assert/strict");
const path = require("path");
const os = require("os");

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ❌ ${name}\n     ${err.message}`);
  }
}

/* ── Unit tests ────────────────────────────────────────────── */

async function unit() {
  const { parseConsoleLine, parseListResponse, parseTps } = require("../lib/parsers");
  const { cleanLine } = require("../lib/text");

  console.log("\n▸ Console line parser");
  const uuid = "069a79f4-44e9-4726-a5be-fca90e38aaf5";
  const cases = [
    // Vanilla / Fabric
    ["[12:00:00] [User Authenticator #1/INFO]: UUID of player Steve is " + uuid, { type: "uuid", name: "Steve", uuid }],
    ["[12:00:00] [Server thread/INFO]: Steve[/192.168.1.20:53422] logged in with entity id 123 at (0.5, 64.0, 0.5)", { type: "login", name: "Steve", ip: "192.168.1.20" }],
    ["[12:00:00] [Server thread/INFO]: Steve joined the game", { type: "join", name: "Steve" }],
    ["[12:00:05] [Server thread/INFO]: Steve left the game", { type: "leave", name: "Steve" }],
    ['[12:00:00] [Server thread/INFO]: Done (5.123s)! For help, type "help"', { type: "done" }],
    // Paper
    ["[12:00:00 INFO]: UUID of player Alex_2 is " + uuid.replace(/-/g, ""), { type: "uuid", name: "Alex_2", uuid }],
    ["[12:00:00 INFO]: Alex_2 joined the game", { type: "join", name: "Alex_2" }],
    ["[12:00:00 INFO]: Alex_2 (formerly known as Alex) joined the game", { type: "join", name: "Alex_2" }],
    ["[12:00:00 INFO]: Alex_2 left the game", { type: "leave", name: "Alex_2" }],
    // Forge / NeoForge
    ["[12:00:00] [Server thread/INFO] [minecraft/MinecraftServer]: Notch joined the game", { type: "join", name: "Notch" }],
    ["[15Oct2026 12:00:00.000] [Server thread/INFO] [net.minecraft.server.MinecraftServer/]: Notch left the game", { type: "leave", name: "Notch" }],
  ];
  for (const [line, expected] of cases) {
    await test(line.slice(0, 70), () => assert.deepEqual(parseConsoleLine(line), expected));
  }

  await test("real Paper TTY line (JLine prompt + CR + colours)", () =>
    assert.deepEqual(
      parseConsoleLine(cleanLine(">....\r\x1b[K[00:38:54 INFO]: \x1b[93mDbgBot joined the game\x1b[0m\r")),
      { type: "join", name: "DbgBot" }
    )
  );
  await test("real Paper login line", () =>
    assert.deepEqual(
      parseConsoleLine(cleanLine(">....\r\x1b[K[00:38:54 INFO]: DbgBot[/172.17.0.1:36170] logged in with entity id 25 at ([world]238.5, 76.0, 433.5)\r")),
      { type: "login", name: "DbgBot", ip: "172.17.0.1" }
    )
  );
  await test("chat cannot fake a join", () =>
    assert.equal(parseConsoleLine("[12:00:00] [Server thread/INFO]: <Steve> Bob joined the game"), null)
  );
  await test("broadcast cannot fake a join", () =>
    assert.equal(parseConsoleLine("[12:00:00 INFO]: [Server] Bob joined the game"), null)
  );
  await test("Chunky progress", () => {
    const evt = parseConsoleLine(
      "[12:00:00 INFO]: [Chunky] Task running for world. Processed: 1234 chunks (12.34%), ETA: 0:10:00, Rate: 100.5 cps, Current: 10, 20"
    );
    assert.equal(evt.type, "chunky");
    assert.equal(evt.percent, 12.34);
    assert.equal(evt.eta, "0:10:00");
  });
  await test("cleanLine strips ANSI, CR and prompt", () =>
    assert.equal(cleanLine("\x1b[0m> \x1b[32m[12:00:00 INFO]: hi\x1b[0m\r"), "[12:00:00 INFO]: hi")
  );

  console.log("\n▸ list / TPS parsers");
  await test("vanilla list", () =>
    assert.deepEqual(parseListResponse("There are 2 of a max of 20 players online: Steve, Alex"), {
      count: 2, max: 20, names: ["Steve", "Alex"],
    })
  );
  await test("empty list", () =>
    assert.deepEqual(parseListResponse("There are 0 of a max of 10 players online: "), { count: 0, max: 10, names: [] })
  );
  await test("grouped list (old Paper/Essentials)", () =>
    assert.deepEqual(
      parseListResponse("There are 2 out of maximum 20 players online.\ndefault: Steve, Alex"),
      { count: 2, max: 20, names: ["Steve", "Alex"] }
    )
  );
  await test("paper tps", () => assert.equal(parseTps("paper", "TPS from last 1m, 5m, 15m: *20.0, 19.5, 19.98").tps, 20));
  await test("paper mspt", () =>
    assert.equal(parseTps("paper-mspt", "Server tick times (avg/min/max) from last 5s, 10s, 1m:\n◴ 1.2/0.9/3.4, 1.1/0.8/3.0").mspt, 1.2)
  );
  await test("spark tps", () => {
    const r = parseTps("spark", "TPS from last 5s, 10s, 1m, 5m, 15m:\n 19.9, 20.0, 20.0, 20.0, 20.0\n\nTick durations (min/med/95%ile/max ms) from last 10s, 1m:\n 1.0/2.5/4.0/9.0;  1.0/2.0/3.0/10.0");
    assert.equal(r.tps, 19.9);
    assert.equal(r.mspt, 2.5);
  });
  await test("vanilla tick query", () => {
    const r = parseTps("tick", "The game is running normally\nTarget tick rate: 20.0 per second.\nAverage time per tick: 4.0ms (Target: 50.0ms)");
    assert.equal(r.mspt, 4);
    assert.equal(r.tps, 20);
  });

  console.log("\n▸ Module loading");
  process.env.PANEL_DB_PATH = path.join(os.tmpdir(), `panel-test-${process.pid}.db`);
  for (const mod of ["../routes/servers", "../routes/players", "../routes/mods", "../routes/worlds", "../routes/backups", "../routes/misc", "../sockets"]) {
    await test(`require ${mod}`, () => require(mod));
  }
}

/* ── Live end-to-end test ──────────────────────────────────── */

async function live() {
  const base = process.env.PANEL_URL || "http://localhost:3001";
  let cookie = "";
  const api = async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const data = res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text();
    if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${data.error || data}`);
    return data;
  };
  const waitFor = async (what, fn, timeoutMs) => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      if (await fn().catch(() => false)) return;
      await new Promise((r) => setTimeout(r, 3000));
    }
    throw new Error(`timeout waiting for ${what}`);
  };

  console.log(`\n▸ Live test against ${base}`);
  let server;
  await test("rejects unauthenticated requests", async () => {
    const res = await fetch(base + "/api/servers");
    assert.equal(res.status, 401);
  });
  await test("login", () => api("POST", "/api/auth/login", { password: process.env.ADMIN_PASSWORD }));
  await test("create Paper server", async () => {
    const { versions } = await api("GET", "/api/versions/PAPER");
    server = await api("POST", "/api/servers", {
      name: `e2e-test-${Date.now() % 100000}`,
      type: "PAPER",
      version: versions[0],
      memory_mb: 1536,
      allowOvercommit: true,
    });
    assert.ok(server.id);
  });
  if (!server) return;
  try {
    await test("server becomes online", () =>
      waitFor("online", async () => (await api("GET", `/api/servers/${server.id}`)).runtime.status === "online", 600000)
    );
    await test("RCON list via players endpoint", async () => {
      await new Promise((r) => setTimeout(r, 5000));
      const p = await api("GET", `/api/servers/${server.id}/players`);
      assert.ok(Array.isArray(p.online));
      assert.ok(p.max > 0, "max players known after reconcile");
    });
    await test("terminal command", () => api("POST", `/api/servers/${server.id}/command`, { command: "say e2e" }));
    await test("install Chunky from Modrinth", async () => {
      const { installed } = await api("POST", `/api/servers/${server.id}/mods/install`, { projectId: "chunky" });
      assert.ok(installed[0].endsWith(".jar"));
      const list = await api("GET", `/api/servers/${server.id}/mods`);
      assert.ok(list.some((m) => m.filename === installed[0] && m.projectId));
    });
    await test("restart → online again", async () => {
      await api("POST", `/api/servers/${server.id}/restart`);
      await waitFor("online", async () => (await api("GET", `/api/servers/${server.id}`)).runtime.status === "online", 300000);
    });
    await test("container limits applied", async () => {
      const s = await api("GET", `/api/servers/${server.id}`);
      assert.ok(s.runtime.stats.ram_limit_mb >= 1536);
    });
    await test("concurrent operation → 409", async () => {
      await api("POST", `/api/servers/${server.id}/backups`);
      await assert.rejects(api("POST", `/api/servers/${server.id}/restart`), /409/);
      await waitFor("backup end", async () => !(await api("GET", `/api/servers/${server.id}`)).lock, 300000);
    });
  } finally {
    await test("delete server", () =>
      api("DELETE", `/api/servers/${server.id}`, { confirm: server.name, deleteData: true, deleteBackups: true })
    );
  }
}

(async () => {
  if (process.argv.includes("--live")) await live();
  else await unit();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
