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
    const powershellPids = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (powershellPids.length > 0) return [...new Set(powershellPids)];
  } catch {
    // Algumas instalações do Windows bloqueiam Get-NetTCPConnection sem elevação.
  }

  const fallback = spawnSync("netstat", ["-ano", "-p", "tcp"], {
    encoding: "utf8",
    windowsHide: true,
    shell: false,
  });
  if (fallback.status !== 0 || !fallback.stdout) return [];

  const pids = fallback.stdout
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*TCP\s+\S+:3000\s+\S+\s+LISTENING\s+(\d+)\s*$/i)?.[1])
    .filter(Boolean);
  return [...new Set(pids)];
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
    const direct = spawnSync(
      "powershell",
      ["-NoProfile", "-Command", `Stop-Process -Id ${pid} -Force -ErrorAction Stop`],
      { stdio: "ignore", shell: false, windowsHide: true },
    );
    if (direct.status !== 0) {
      const tree = spawnSync("taskkill", ["/PID", pid, "/F", "/T"], {
        stdio: "ignore",
        shell: false,
      });
      if (tree.status !== 0 && tree.status !== 128) {
        console.error(`[stop-dev] Não foi possível encerrar o PID ${pid}.`);
      }
    }
  } else {
    spawnSync("kill", ["-TERM", pid], { stdio: "inherit" });
  }
}

const remaining = os.platform() === "win32" ? pidsWindows() : pidsUnix();
if (remaining.length > 0) {
  console.error(`[stop-dev] A porta ${port} continua ocupada pelo PID ${remaining.join(", ")}.`);
  process.exit(1);
}

console.log(`[stop-dev] Porta ${port} libertada. Rode npm run dev de novo.`);
