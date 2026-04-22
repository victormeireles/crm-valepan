/**
 * Cria (ou atualiza) o usuário admin no Supabase Auth e o perfil em crm.profiles.
 * Requer SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local da raiz.
 *
 * Login na aplicação: usuário `admin`; senha = ADMIN_PASSWORD (ver abaixo).
 *
 * A senha literal `admin` tem 5 caracteres. O Supabase (padrão) exige no mínimo 6.
 * Opções: (1) No painel: Authentication → Providers → Email → Minimum password length = 5
 *         e no .env.local: ADMIN_PASSWORD=admin
 *     (2) Deixe o padrão abaixo ou defina ADMIN_PASSWORD com 6+ caracteres (ex.: admin1).
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const CRM_LOGIN_EMAIL_DOMAIN = "login.crm.valepan";
const ADMIN_USERNAME = "admin";
const ADMIN_EMAIL = `${ADMIN_USERNAME}@${CRM_LOGIN_EMAIL_DOMAIN}`;

const root = path.join(__dirname, "..");

function loadEnvLocal() {
  const p = path.join(root, ".env.local");
  if (!fs.existsSync(p)) {
    console.error("Arquivo .env.local não encontrado na raiz do monorepo.");
    process.exit(1);
  }
  const content = fs.readFileSync(p, "utf8");
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

loadEnvLocal();

/** Padrão admin1 (6 caracteres) para funcionar com a política típica do Supabase. */
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin1";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE;

if (!url || !serviceRole) {
  console.error(
    "Defina SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY (ou SERVICE_ROLE) no .env.local",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** @returns {Promise<boolean>} true se o perfil foi ajustado via RPC */
async function setAdminProfile(userId) {
  const { error } = await supabase.rpc("crm_seed_set_admin_profile", {
    p_user_id: userId,
  });
  if (error) {
    console.log(
      "[seed:admin] Não foi possível chamar public.crm_seed_set_admin_profile (migrations aplicadas no projeto?).",
    );
    console.log(`[seed:admin] ${error.message}`);
    console.log(
      "[seed:admin] Ajuste o perfil manualmente no SQL Editor do Supabase:",
    );
    console.log(
      `  update crm.profiles set full_name = 'Administrador', role = 'admin'::crm.user_role where id = '${userId}';`,
    );
    return false;
  }
  return true;
}

async function main() {
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) {
    console.error(listErr.message);
    process.exit(1);
  }

  const existing = list.users.find((u) => u.email === ADMIN_EMAIL);

  if (existing) {
    const { error: updErr } = await supabase.auth.admin.updateUserById(
      existing.id,
      {
        password: ADMIN_PASSWORD,
        user_metadata: {
          username: ADMIN_USERNAME,
          full_name: "Administrador",
          role: "admin",
        },
      },
    );
    if (updErr) {
      console.error(updErr.message);
      if (/password/i.test(updErr.message)) {
        console.error(
          "\n[seed:admin] Dica: senha muito curta para a política do projeto. Use ADMIN_PASSWORD no .env.local (6+ caracteres) ou reduza o mínimo no Supabase Auth (Email).",
        );
      }
      process.exit(1);
    }
    const okProfile = await setAdminProfile(existing.id);
    console.log(
      okProfile
        ? `Usuário admin já existia; senha redefinida para "${ADMIN_PASSWORD}" e perfil atualizado.`
        : `Usuário admin já existia; senha redefinida para "${ADMIN_PASSWORD}". (Veja acima se o perfil precisou de ajuste manual.)`,
    );
    return;
  }

  const { data: created, error: createErr } =
    await supabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: {
        username: ADMIN_USERNAME,
        full_name: "Administrador",
        role: "admin",
      },
    });

  if (createErr) {
    console.error(createErr.message);
    if (/password/i.test(createErr.message)) {
      console.error(
        "\n[seed:admin] Dica: senha muito curta para a política do projeto. Use ADMIN_PASSWORD no .env.local (6+ caracteres) ou reduza o mínimo no Supabase Auth (Email).",
      );
    }
    process.exit(1);
  }

  const id = created.user.id;
  const okProfile = await setAdminProfile(id);

  console.log(
    okProfile
      ? `Criado usuário admin: usuário "${ADMIN_USERNAME}", senha "${ADMIN_PASSWORD}" (troque em produção).`
      : `Criado usuário admin no Auth: usuário "${ADMIN_USERNAME}", senha "${ADMIN_PASSWORD}". (Veja acima se o perfil precisou de ajuste manual.)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
