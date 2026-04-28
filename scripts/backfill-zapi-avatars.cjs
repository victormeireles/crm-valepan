const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function loadEnv(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const idx = t.indexOf("=");
    if (idx < 0) continue;
    env[t.slice(0, idx).trim()] = t.slice(idx + 1).trim();
  }
  return env;
}

async function fetchZapiProfilePictureLink(base, inst, token, clientToken, phoneDigitsOrE164) {
  const digits = String(phoneDigitsOrE164 || "").replace(/\D/g, "");
  if (digits.length < 8) return null;

  const root = `${base.replace(/\/$/, "")}/instances/${inst}/token/${token}`;
  const candidates = [
    `${root}/profile-picture?phone=${encodeURIComponent(digits)}`,
    `${root}/profile-picture/${digits}`,
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(clientToken ? { "Client-Token": clientToken } : {}),
        },
      });
      if (!res.ok) continue;
      const json = await res.json().catch(() => null);
      const link =
        json && typeof json === "object" && typeof json.link === "string"
          ? json.link.trim()
          : "";
      if (link) return link;
    } catch {
      // tenta próxima variação
    }
  }
  return null;
}

async function main() {
  const root = path.join(__dirname, "..");
  const env = {
    ...loadEnv(path.join(root, ".env.local")),
    ...loadEnv(path.join(root, "apps", "crm", ".env.local")),
  };

  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = env.SERVICE_ROLE || env.SUPABASE_SERVICE_ROLE_KEY;
  const zapiBase = env.ZAPI_BASE_URL || "https://api.z-api.io";
  const zapiInstanceId = env.ZAPI_INSTANCE_ID;
  const zapiToken = env.ZAPI_TOKEN;
  const zapiClientToken = env.ZAPI_CLIENT_TOKEN;

  if (!supabaseUrl || !serviceRole || !zapiInstanceId || !zapiToken) {
    throw new Error("Env incompleto para backfill de avatars.");
  }

  const crm = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).schema("crm");

  const { data: contacts, error } = await crm
    .from("contacts")
    .select("id, phone_e164, avatar_url")
    .order("updated_at", { ascending: false })
    .limit(3000);
  if (error) throw error;

  let checked = 0;
  let updated = 0;

  const hasValidAvatar = (v) => {
    const t = String(v ?? "").trim();
    if (!t) return false;
    const low = t.toLowerCase();
    return low !== "null" && low !== "undefined";
  };

  for (const c of contacts ?? []) {
    checked += 1;
    if (hasValidAvatar(c.avatar_url)) continue;

    const link = await fetchZapiProfilePictureLink(
      zapiBase,
      zapiInstanceId,
      zapiToken,
      zapiClientToken,
      c.phone_e164,
    );
    if (!link) continue;

    const nowIso = new Date().toISOString();
    const { error: updateErr } = await crm
      .from("contacts")
      .update({
        avatar_url: link,
        avatar_updated_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", c.id);
    if (!updateErr) updated += 1;
  }

  console.log(
    `Backfill concluído. contatos_lidos=${checked} contatos_atualizados=${updated}`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
