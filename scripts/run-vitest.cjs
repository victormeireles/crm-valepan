const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const sharedDir = path.join(root, "packages", "shared");
const vitest = path.join(root, "node_modules", "vitest", "vitest.mjs");

const r = spawnSync(process.execPath, [vitest, "run"], {
  cwd: sharedDir,
  stdio: "inherit",
  env: process.env,
});

process.exit(r.status ?? 1);
