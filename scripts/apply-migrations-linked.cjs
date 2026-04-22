/**
 * Aplica cada arquivo em apps/crm/supabase/migrations/*.sql no banco **linkado**
 * (supabase link já executado), via Management API — não usa o histórico do db push.
 *
 * Útil quando o projeto remoto tem migrations antigas que não existem neste repositório.
 *
 * Requer no ambiente (ex.: `.supabase.credentials.local`):
 *   SUPABASE_ACCESS_TOKEN
 *   SUPABASE_PROJECT_REF + SUPABASE_DB_PASSWORD (para `supabase link` antes das queries)
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

/** No Windows, garantir Node no PATH para achar npx.cmd quando o terminal não herdou o PATH completo. */
if (process.platform === "win32") {
  const nodeDir = path.join(process.env.ProgramFiles || "C:\\Program Files", "nodejs");
  if (!process.env.PATH?.toLowerCase().includes("nodejs")) {
    process.env.PATH = `${nodeDir};${process.env.PATH || ""}`;
  }
}

const root = path.join(__dirname, "..");
const appCrm = path.join(root, "apps", "crm");
const migrationsDir = path.join(appCrm, "supabase", "migrations");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function loadEnvLocal() {
  loadEnvFile(path.join(root, ".supabase.credentials.local"));
  loadEnvFile(path.join(root, ".env.local"));
  loadEnvFile(path.join(appCrm, ".env.local"));
}

/** Windows: spawn sem shell falha com EINVAL ao chamar npx.cmd; usar uma linha + shell: true. */
function shellQuote(arg) {
  const s = String(arg);
  if (/[\s&|^<>()]/.test(s) || s.includes('"') || s.includes("'")) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}

/** `args` = argumentos após `npx` (ex.: ["supabase", "link", ...]). */
function run(args) {
  const line = ["npx", ...args].map(shellQuote).join(" ");
  const r = spawnSync(line, {
    cwd: appCrm,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  return r.status === null ? 1 : r.status;
}

loadEnvLocal();

if (!process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
  console.error(
    "[apply-migrations-linked] Defina SUPABASE_ACCESS_TOKEN (ex.: em .supabase.credentials.local).",
  );
  process.exit(1);
}

const pref = process.env.SUPABASE_PROJECT_REF?.trim();
const dbPass = process.env.SUPABASE_DB_PASSWORD;
if (pref && dbPass) {
  console.log("[apply-migrations-linked] supabase link…\n");
  const linkCode = run([
    "supabase",
    "link",
    "--project-ref",
    pref,
    "-p",
    dbPass,
    "--yes",
  ]);
  if (linkCode !== 0) process.exit(linkCode);
}

const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.error("[apply-migrations-linked] Nenhum .sql em", migrationsDir);
  process.exit(1);
}

console.log(
  `[apply-migrations-linked] ${files.length} arquivo(s). Projeto linkado em apps/crm.\n`,
);

for (const f of files) {
  const rel = path.join("supabase", "migrations", f).replace(/\\/g, "/");
  console.log(`\n--- ${f} ---\n`);
  const code = run([
    "supabase",
    "db",
    "query",
    "--linked",
    "--file",
    rel,
    "--agent",
    "no",
  ]);
  if (code !== 0) {
    console.error(`\n[apply-migrations-linked] Falhou em: ${f}`);
    process.exit(code);
  }
}

console.log("\n[apply-migrations-linked] Concluído.");
