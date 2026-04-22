/**
 * Aplica apenas `20260422180000_zapi_lid_map.sql` no Postgres remoto.
 *
 * Preferência: `DATABASE_URL` (ou SUPABASE_DB_URL / DIRECT_URL) no `.env.local` da raiz
 * → `supabase db query --db-url … -f …` (sem token de management).
 *
 * Alternativa: `SUPABASE_ACCESS_TOKEN` + projeto já linkado em `apps/crm`
 * → `supabase db query --linked -f …`.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

if (process.platform === "win32") {
  const nodeDir = path.join(process.env.ProgramFiles || "C:\\Program Files", "nodejs");
  if (!process.env.PATH?.toLowerCase().includes("nodejs")) {
    process.env.PATH = `${nodeDir};${process.env.PATH || ""}`;
  }
}

const root = path.join(__dirname, "..");
const appCrm = path.join(root, "apps", "crm");
const sqlRel = path.join("supabase", "migrations", "20260422180000_zapi_lid_map.sql").replace(/\\/g, "/");

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

function shellQuote(arg) {
  const s = String(arg);
  if (/[\s&|^<>()]/.test(s) || s.includes('"') || s.includes("'")) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}

function run(args) {
  const line = ["npx", ...args].map(shellQuote).join(" ");
  return spawnSync(line, {
    cwd: appCrm,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
}

loadEnvFile(path.join(root, ".supabase.credentials.local"));
loadEnvFile(path.join(root, ".env.local"));
loadEnvFile(path.join(appCrm, ".env.local"));

const dbUrl =
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DB_URL ||
  process.env.DIRECT_URL;

if (dbUrl) {
  console.log("[apply-zapi-lid] Usando DATABASE_URL / SUPABASE_DB_URL / DIRECT_URL\n");
  const r = run([
    "supabase",
    "db",
    "query",
    "--db-url",
    dbUrl,
    "-f",
    sqlRel,
    "--agent",
    "no",
  ]);
  process.exit(r.status === null ? 1 : r.status);
}

if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
  console.log("[apply-zapi-lid] Usando supabase db query --linked (SUPABASE_ACCESS_TOKEN)\n");
  const r = run(["supabase", "db", "query", "--linked", "-f", sqlRel, "--agent", "no"]);
  process.exit(r.status === null ? 1 : r.status);
}

console.error(
  [
    "[apply-zapi-lid] Não foi possível conectar ao banco.",
    "  Opção A: defina DATABASE_URL no .env.local (URI Postgres, porta 5432).",
    "  Opção B: defina SUPABASE_ACCESS_TOKEN e rode `npm run db:push` ou `supabase link` em apps/crm, depois rode este script de novo.",
  ].join("\n"),
);
process.exit(1);
