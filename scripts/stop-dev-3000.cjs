/**
 * Encerra processos em escuta na porta 3000 (ex.: outro `npm run dev` esquecido).
 * Windows: Get-NetTCPConnection + taskkill. Unix: lsof + kill.
 */
const { execSync, spawnSync } = require("child_process");
const os = require("os");

const port = 3000;

function pidsWindows() {
  try {
    const out = execSync(
      `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique"`,
      { encoding: "utf8", windowsHide: true },
    );
    return [...new Set(out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))];
  } catch {
    return [];
  }
}

function pidsUnix() {
  try {
    const out = execSync(`lsof -iTCP:${port} -sTCP:LISTEN -t 2>/dev/null`, {
      encoding: "utf8",
      windowsHide: true,
    });
    return [...new Set(out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))];
  } catch {
    return [];
  }
}

const pids = os.platform() === "win32" ? pidsWindows() : pidsUnix();

if (pids.length === 0) {
  console.log(`[stop-dev] Nenhum processo em escuta na porta ${port}.`);
  process.exit(0);
}

for (const pid of pids) {
  console.log(`[stop-dev] Encerrando PID ${pid}…`);
  if (os.platform() === "win32") {
    const r = spawnSync("taskkill", ["/PID", pid, "/F"], { stdio: "inherit", shell: false });
    if (r.status !== 0 && r.status !== 128) {
      console.error(`[stop-dev] taskkill falhou para PID ${pid} (pode precisar de permissões de administrador).`);
    }
  } else {
    spawnSync("kill", ["-TERM", pid], { stdio: "inherit" });
  }
}

console.log(`[stop-dev] Porta ${port} libertada. Rode npm run dev de novo.`);
