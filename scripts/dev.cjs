/**
 * Inicia o CRM em desenvolvimento (http://127.0.0.1:3000).
 * Uso: npm run dev
 */
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

const root = path.join(__dirname, "..");
const appDir = path.join(root, "apps", "crm");
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
const PORT = 3000;
const OPEN_URL = `http://127.0.0.1:${PORT}/dashboard`;

const run = (script) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, script)], {
      cwd: root,
      stdio: "inherit",
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} saiu com código ${code ?? 1}`));
    });
  });

function waitForServer(maxMs = 120_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      if (Date.now() - start > maxMs) {
        reject(new Error("Servidor não respondeu a tempo."));
        return;
      }
      const req = http.get(`http://127.0.0.1:${PORT}/`, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => setTimeout(tryOnce, 400));
      req.setTimeout(2000, () => {
        req.destroy();
        setTimeout(tryOnce, 400);
      });
    };
    tryOnce();
  });
}

function openBrowser(url) {
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  } else if (process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  }
}

(async () => {
  const fs = require("fs");
  if (!fs.existsSync(nextCli)) {
    console.error(
      "\n[dev] Next.js não encontrado. Na raiz do projeto rode: npm install\n",
    );
    process.exit(1);
  }

  console.log("\n=== CRM Valepan — modo desenvolvimento ===\n");
  try {
    await run("sync-env.cjs");
    await run("stop-dev-3000.cjs");
  } catch (e) {
    console.error("[dev]", e.message);
    process.exit(1);
  }

  console.log(
    "\n┌─────────────────────────────────────────────────────────────┐\n" +
      "│  MANTENHA ESTE TERMINAL ABERTO enquanto usa o CRM no browser │\n" +
      "│  URL: http://127.0.0.1:3000/dashboard                        │\n" +
      "│  Parar o servidor: Ctrl+C                                    │\n" +
      "└─────────────────────────────────────────────────────────────┘\n",
  );

  const childEnv = { ...process.env, PORT: String(PORT) };
  const child = spawn(
    process.execPath,
    [nextCli, "dev", "--turbopack", "-H", "127.0.0.1", "-p", String(PORT)],
    { cwd: appDir, stdio: "inherit", env: childEnv, shell: false },
  );

  waitForServer()
    .then(() => {
      console.log(`\n[dev] Servidor pronto. A abrir ${OPEN_URL}\n`);
      openBrowser(OPEN_URL);
    })
    .catch(() => {
      /* Next ainda a compilar; o utilizador abre manualmente */
    });

  child.on("error", (err) => {
    console.error("[dev] Falha ao iniciar:", err.message);
    process.exit(1);
  });

  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(
        `\n[dev] O servidor terminou (código ${code}).\n` +
          "   Se viu 'Another next dev server is already running', rode: npm run dev:stop\n",
      );
    }
    process.exit(code ?? 1);
  });
})();
