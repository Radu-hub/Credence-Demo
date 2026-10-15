// ─── Unified Test Suite Runner for PassGate ──────────────────────────────────
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const testFiles = [
  "test/unit/appleCertManager.test.js",
  "test/unit/cborEncoder.test.js",
  "test/unit/appleWalletService.test.js",
  "test/unit/mdlVerifier.test.js",
  "test/integration/api-routes.test.js",
  "test/integration/menu-cart.test.js"
];

console.log("\n=======================================================");
console.log("🚀 PASSGATE FULL APPLICATION TEST SUITE");
console.log("=======================================================\n");

let passed = 0;
let failed = 0;

async function runTest(file) {
  const fullPath = path.join(__dirname, "..", file);
  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn(process.execPath, ["--test", fullPath], {
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "test" }
    });

    child.on("close", (code) => {
      const elapsed = ((Date.now() - start) / 1000).toFixed(2);
      if (code === 0) {
        console.log(`\n✅ ${file} (Passed in ${elapsed}s)\n`);
        passed++;
      } else {
        console.error(`\n❌ ${file} (Failed with code ${code})\n`);
        failed++;
      }
      resolve();
    });
  });
}

async function main() {
  for (const file of testFiles) {
    await runTest(file);
  }

  console.log("=======================================================");
  console.log(`TEST SUITE SUMMARY: ${passed} passed, ${failed} failed`);
  console.log("=======================================================\n");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
