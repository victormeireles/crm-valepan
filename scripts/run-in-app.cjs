/**
 * Executa o CLI do Next.js com cwd em apps/crm (evita depender do npm no PATH em scripts aninhados no Windows).
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const appDir = path.join(root, "apps", "crm");
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
const args = process.argv.slice(2);

function readPortFromEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return undefined;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^PORT\s*=\s*(.+)$/.exec(trimmed);
    if (!match) continue;
    const value = match[1].trim().replace(/^['"]|['"]$/g, "");
    return value || undefined;
  }
  return undefined;
}

if (args.length === 0) {
  console.error("Uso: node scripts/run-in-app.cjs <comando next> [args...]");
  process.exit(1);
}

if (args[0] === "dev") {
  const alreadyHasPort = args.includes("-p") || args.includes("--port");
  if (!alreadyHasPort) {
    const appEnvPath = path.join(appDir, ".env.local");
    const rootEnvPath = path.join(root, ".env.local");
    const port = readPortFromEnvFile(appEnvPath) ?? readPortFromEnvFile(rootEnvPath);
    if (port) args.push("-p", port);
  }
}

const r = spawnSync(process.execPath, [nextCli, ...args], {
  cwd: appDir,
  stdio: "inherit",
  env: process.env,
  shell: false,
});

process.exit(r.status ?? 1);
