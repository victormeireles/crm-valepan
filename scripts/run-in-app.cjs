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

if (!fs.existsSync(nextCli)) {
  console.error(
    "[run-in-app] Next.js CLI nao encontrado em node_modules. Rode `npm install` na raiz do projeto e tente novamente."
  );
  process.exit(1);
}

if (args.length === 0) {
  console.error("Uso: node scripts/run-in-app.cjs <comando next> [args...]");
  process.exit(1);
}

/** Remove flags de porta para podermos fixar uma única porta em dev. */
function stripPortFlags(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-p" || a === "--port") {
      i += 1;
      continue;
    }
    if (a.startsWith("--port=")) continue;
    out.push(a);
  }
  return out;
}

let childEnv = process.env;

if (args[0] === "dev") {
  // Sempre http://localhost:3000 — ignora PORT em .env.local e evita o Next saltar para 3001.
  const withoutPort = stripPortFlags(args);
  args.length = 0;
  args.push(...withoutPort, "-p", "3000");
  childEnv = { ...process.env, PORT: "3000" };
}

const r = spawnSync(process.execPath, [nextCli, ...args], {
  cwd: appDir,
  stdio: "inherit",
  env: childEnv,
  shell: false,
});

if (r.error) {
  console.error("[run-in-app] Falha ao iniciar o Next.js:", r.error.message);
  process.exit(1);
}

process.exit(r.status ?? 1);
