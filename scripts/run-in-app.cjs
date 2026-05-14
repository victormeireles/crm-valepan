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

/** Remove -H/--hostname para aplicarmos um host previsível em dev. */
function stripHostnameFlags(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-H" || a === "--hostname") {
      i += 1;
      continue;
    }
    if (a.startsWith("--hostname=")) continue;
    out.push(a);
  }
  return out;
}

/** Verifica se algo aceita TCP em 127.0.0.1:port (dev já a correr ou outro serviço). */
function isLocalPortAcceptingConnections(port) {
  const r = spawnSync(
    process.execPath,
    [
      "-e",
      "const n=require('net');" +
        "const c=n.connect(" +
        port +
        ",'127.0.0.1',()=>{c.destroy();process.exit(2)});" +
        "c.on('error',()=>process.exit(0));" +
        "setTimeout(()=>process.exit(0),600);",
    ],
    { timeout: 1500, encoding: "utf8" },
  );
  return r.status === 2;
}

let childEnv = process.env;

if (args[0] === "dev") {
  // Porta 3000 fixa; 0.0.0.0 evita bind só em :: (IPv6) no Windows, que por vezes falha com "localhost".
  const cleaned = stripHostnameFlags(stripPortFlags(args));
  args.length = 0;
  args.push(...cleaned, "-H", "0.0.0.0", "-p", "3000");
  childEnv = { ...process.env, PORT: "3000" };

  if (isLocalPortAcceptingConnections(3000)) {
    console.warn(
      "[run-in-app] Porta 3000 ocupada (outro `next dev` ou serviço). A libertar automaticamente…",
    );
    const stopScript = path.join(__dirname, "stop-dev-3000.cjs");
    spawnSync(process.execPath, [stopScript], {
      cwd: root,
      stdio: "inherit",
      shell: false,
    });
    const until = Date.now() + 1000;
    while (Date.now() < until) {
      /* esperar o SO libertar o socket */
    }
    if (isLocalPortAcceptingConnections(3000)) {
      console.error(
        "\n[run-in-app] A porta 3000 continua ocupada. Rode: npm run dev:stop\n" +
          "   Ou no PowerShell: Get-NetTCPConnection -LocalPort 3000\n",
      );
      process.exit(1);
    }
    console.warn("[run-in-app] Porta libertada. A iniciar o servidor…");
  }

  console.log(
    "[run-in-app] Dev → http://localhost:3000 (ou http://127.0.0.1:3000). Se não abrir, verifique o proxy do Windows para endereços locais.",
  );
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
