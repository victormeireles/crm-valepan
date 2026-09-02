const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const sharedDir = path.join(root, "packages", "shared");
const crmDir = path.join(root, "apps", "crm");
const vitest = path.join(root, "node_modules", "vitest", "vitest.mjs");

for (const workspaceDir of [sharedDir, crmDir]) {
  const r = spawnSync(
    process.execPath,
    [vitest, "run", "--root", workspaceDir, "--config", "vitest.config.ts"],
    {
      cwd: root,
      stdio: "inherit",
      env: process.env,
    },
  );

  if (r.status !== 0) process.exit(r.status ?? 1);
}
