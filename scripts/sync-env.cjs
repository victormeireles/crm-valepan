/**
 * Copia `.env.local` da raiz do monorepo para `apps/crm`, onde o Next.js carrega por padrão.
 * Sem isso, variáveis como SUPABASE_URL na raiz podem não aparecer no servidor (inlining).
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = path.join(root, ".env.local");
const dest = path.join(root, "apps", "crm", ".env.local");

if (!fs.existsSync(src)) {
  console.warn("[sync-env] Nenhum .env.local na raiz — ignorando.");
  process.exit(0);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log("[sync-env] Copiado .env.local → apps/crm/.env.local");
