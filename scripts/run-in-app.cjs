/**
 * Executa o CLI do Next.js com cwd em apps/crm (evita depender do npm no PATH em scripts aninhados no Windows).
 */
const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const appDir = path.join(root, "apps", "crm");
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Uso: node scripts/run-in-app.cjs <comando next> [args...]");
  process.exit(1);
}

const r = spawnSync(process.execPath, [nextCli, ...args], {
  cwd: appDir,
  stdio: "inherit",
  env: process.env,
  shell: false,
});

process.exit(r.status ?? 1);
