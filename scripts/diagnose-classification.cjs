const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function loadEnv(file) {
  const contents = fs.readFileSync(file, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnv(path.join(__dirname, "..", ".env.local"));

const url = process.env.SUPABASE_URL;
const key = process.env.SERVICE_ROLE;
if (!url || !key) throw new Error("Configuração local do Supabase ausente.");

const crm = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
}).schema("crm");

async function check(label, promise) {
  const started = Date.now();
  const result = await promise;
  console.log(JSON.stringify({
    label,
    elapsedMs: Date.now() - started,
    count: Array.isArray(result.data) ? result.data.length : result.count ?? (result.data ? 1 : 0),
    error: result.error ? { code: result.error.code, message: result.error.message } : null,
  }));
}

async function main() {
  const visibleSince = "2026-04-01T00:00:00.000Z";
  const common = {
    p_messages_visible_since: visibleSince,
    p_owner_user_id: null,
    p_signal: null,
    p_region: null,
    p_client_category: null,
    p_query: null,
    p_stage_id: null,
    p_volume: null,
  };

  await Promise.all([
    check("pipeline_cards_page", crm.rpc("pipeline_cards_page", {
      ...common,
      p_offset: 0,
      p_limit: 20,
    })),
    check("pipeline_stage_counts", crm.rpc("pipeline_stage_counts", common)),
    check("pipeline_owner_counts", crm.rpc("pipeline_owner_counts", {
      p_messages_visible_since: visibleSince,
      p_signal: null,
      p_region: null,
      p_client_category: null,
      p_query: null,
      p_stage_id: null,
      p_volume: null,
    })),
    check("pipeline_owner_summary", crm.rpc("pipeline_owner_summary", {
      p_messages_visible_since: visibleSince,
      p_owner_user_id: null,
      p_region: null,
      p_client_category: null,
      p_query: null,
      p_stage_id: null,
      p_volume: null,
    })),
    check("lead_registrations", crm.from("lead_registrations").select("id", { count: "exact", head: true })),
  ]);

  const credentialsFile = path.join(__dirname, "..", ".supabase.credentials.local");
  if (fs.existsSync(credentialsFile)) loadEnv(credentialsFile);
  if (process.env.SUPABASE_PROJECT_REF && process.env.SUPABASE_ACCESS_TOKEN) {
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/config/auth`,
      { headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` } },
    );
    const config = await response.json();
    console.log(JSON.stringify({
      label: "auth_site",
      status: response.status,
      siteUrl: config.site_url ?? null,
      uriAllowList: config.uri_allow_list ?? null,
    }));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
