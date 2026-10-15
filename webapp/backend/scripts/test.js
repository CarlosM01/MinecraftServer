#!/usr/bin/env node

/**
 * Verification script for the Docker stats & logs integration module.
 * Checks syntax, requires, and optionally tests live Docker connectivity.
 *
 * Usage:
 *   node scripts/verify.js          — syntax + require checks only
 *   node scripts/verify.js --live   — also test Docker connectivity & endpoints
 */

const { execSync } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const files = [
  "server.js",
  "services/dockerService.js",
  "services/backupService.js",
  "services/googleDriveService.js",
  "routes/docker.js",
  "routes/backups.js",
  "routes/googleDrive.js",
  "sockets/docker.js",
  "sockets/backups.js",
];

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    fn();
    console.log(`  ✅ ${label}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${label}`);
    console.log(`     ${err.message}`);
    failed++;
  }
}

/* ── Phase 1: Syntax checks ────────────────────────────────── */
console.log("\n🔍 Phase 1: Syntax checks\n");

files.forEach((f) => {
  const abs = path.join(ROOT, f);
  check(`node --check ${f}`, () => {
    execSync(`node --check "${abs}"`, { stdio: "pipe" });
  });
});

/* ── Phase 2: Require checks (modules load without crash) ── */
console.log("\n🔍 Phase 2: Module require checks\n");

check("services/dockerService.js loads", () => {
  require(path.join(ROOT, "services/dockerService.js"));
});

check("services/backupService.js loads", () => {
  require(path.join(ROOT, "services/backupService.js"));
});

check("services/googleDriveService.js loads", () => {
  require(path.join(ROOT, "services/googleDriveService.js"));
});

check("routes/docker.js loads", () => {
  require(path.join(ROOT, "routes/docker.js"));
});

check("routes/backups.js loads", () => {
  require(path.join(ROOT, "routes/backups.js"));
});

check("routes/googleDrive.js loads", () => {
  require(path.join(ROOT, "routes/googleDrive.js"));
});

check("sockets/docker.js loads", () => {
  require(path.join(ROOT, "sockets/docker.js"));
});

check("sockets/backups.js loads", () => {
  require(path.join(ROOT, "sockets/backups.js"));
});

/* ── Phase 3: Live Docker test (optional, --live flag) ───── */
const isLive = process.argv.includes("--live");

if (isLive) {
  console.log("\n🔍 Phase 3: Live Docker connectivity\n");

  (async () => {
    const dockerService = require(path.join(
      ROOT,
      "services/dockerService.js"
    ));

    check("getContainer() resolves", () => {
      const c = dockerService.getContainer();
      if (!c) throw new Error("Container is null");
    });

    try {
      const info = await dockerService.getInfo();
      console.log(`  ✅ getInfo() → name=${info.name}, status=${info.status}`);
      passed++;
    } catch (err) {
      console.log(`  ❌ getInfo() failed: ${err.message}`);
      failed++;
    }

    try {
      const stats = await dockerService.getStats();
      console.log(
        `  ✅ getStats() → cpu=${stats.cpu_percent}%, ram=${stats.ram_used_mb}/${stats.ram_limit_mb} MB`
      );
      passed++;
    } catch (err) {
      console.log(`  ❌ getStats() failed: ${err.message}`);
      failed++;
    }

    printSummary();
  })();
} else {
  console.log(
    "\n💡 Tip: Run with --live flag to test Docker connectivity\n"
  );
  printSummary();
}

function printSummary() {
  console.log(`\n${"─".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("❌ Some checks failed.\n");
    process.exit(1);
  } else {
    console.log("✅ All checks passed!\n");
  }
}
