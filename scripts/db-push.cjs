/**
 * Aplica migrations em `apps/crm/supabase/migrations` no projeto Supabase remoto.
 *
 * Opção 1 (recomendada): defina DATABASE_URL no .env.local da raiz — string de conexão
 * Postgres do painel (Project Settings → Database → Connection string → URI).
 * Use conexão **Session** ou **Direct** (porta 5432), não Transaction pooler, para DDL.
 *
 * Opção 2: defina SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL) + SUPABASE_DB_PASSWORD
 * (a senha do banco do painel, não as API keys).
 *
 * Opção 3: arquivo na raiz `.supabase.credentials.local` (não versionar) com:
 *   SUPABASE_PROJECT_REF, SUPABASE_DB_PASSWORD, opcional SUPABASE_ACCESS_TOKEN
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

function projectRefFromUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    return u.hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}

function shellQuote(arg) {
  const s = String(arg);
  if (/[\s&|^<>()]/.test(s) || s.includes('"') || s.includes("'")) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}

/** `args` = tudo após `npx` (ex.: supabase db push …). */
function run(args, cwd) {
  const line = ["npx", ...args].map(shellQuote).join(" ");
  const r = spawnSync(line, {
    cwd,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  const code = r.status === null ? 1 : r.status;
  if (code !== 0) process.exit(code);
}

loadEnvLocal();

const dbUrl =
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DB_URL ||
  process.env.DIRECT_URL;

if (dbUrl) {
  console.log("[db-push] Usando DATABASE_URL / SUPABASE_DB_URL / DIRECT_URL\n");
  run(["supabase", "db", "push", "--yes", "--db-url", dbUrl], appCrm);
  console.log("\n[db-push] Migrations aplicadas.");
  process.exit(0);
}

const baseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const password = process.env.SUPABASE_DB_PASSWORD;
const ref =
  process.env.SUPABASE_PROJECT_REF?.trim() ||
  (baseUrl ? projectRefFromUrl(baseUrl) : null);

if (!ref || !password) {
  console.error(
    [
      "[db-push] Falta configuração:",
      "  • DATABASE_URL=<URI Postgres> (recomendado), ou",
      "  • `.supabase.credentials.local` com SUPABASE_PROJECT_REF e SUPABASE_DB_PASSWORD, ou",
      "  • SUPABASE_URL + SUPABASE_DB_PASSWORD",
      "",
      "Senha do banco: Supabase → Project Settings → Database.",
    ].join("\n"),
  );
  process.exit(1);
}

console.log("[db-push] Vinculando projeto e aplicando migrations…\n");
run(["supabase", "link", "--project-ref", ref, "-p", password, "--yes"], appCrm);
run(["supabase", "db", "push", "--yes"], appCrm);
console.log("\n[db-push] Migrations aplicadas.");
