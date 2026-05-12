/**
 * Merge guiado: associa conversas de grupo do CRM ao JID real do WhatsApp (`...@g.us`)
 * e opcionalmente ao nome exibido no app.
 *
 * Formato do CSV (UTF-8), primeira linha com cabeçalho:
 *   conversation_id,group_jid[,group_display_name]
 *
 * Exemplo:
 *   conversation_id,group_jid,group_display_name
 *   bf723ae6-9d0f-41b6-99d0-7a03e6ebc58f,120363407554257008@g.us,Motoristas valepan
 *
 * Comportamento:
 * - Atualiza `phone_e164` para o `group_jid` e `group_display_name` (se informado).
 * - Se não informar nome e tiver ZAPI_* no .env, tenta obter o nome em GET /groups.
 * - Se já existir outra conversa WhatsApp com o mesmo JID, move mensagens para a existente,
 *   remove a duplicata e aplica o nome na conversa que permaneceu.
 *
 * Uso:
 *   node scripts/merge-guided-group-conversations.cjs --file caminho/para/merge.csv
 *   node scripts/merge-guided-group-conversations.cjs --file scripts/examples/group-merge-example.csv --dry-run
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL (ou SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY.
 * Opcional para nome automático: ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN, ZAPI_BASE_URL.
 */

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

function parseArgs() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  let file = null;
  const i = argv.indexOf("--file");
  if (i >= 0 && argv[i + 1]) file = argv[i + 1];
  return { dryRun, file };
}

/** CSV simples: vírgula; campos entre aspas se tiver vírgula no texto. */
function parseCsv(text) {
  const lines = [];
  let cur = "";
  let row = [];
  let inQuotes = false;
  for (let p = 0; p < text.length; p += 1) {
    const c = text[p];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (c === "\n" || c === "\r")) {
      if (c === "\r" && text[p + 1] === "\n") p += 1;
      row.push(cur);
      cur = "";
      const cells = row.map((s) => s.trim());
      if (cells.some(Boolean)) lines.push(cells);
      row = [];
      continue;
    }
    if (!inQuotes && c === ",") {
      row.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  row.push(cur);
  const cells = row.map((s) => s.trim());
  if (cells.some(Boolean)) lines.push(cells);
  return lines;
}

function normalizeGroupJid(raw) {
  const t = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (!t.includes("@g.us")) return null;
  return t;
}

function canonicalFromZapiListPhone(phone) {
  const raw = String(phone ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (!raw) return null;
  if (raw.includes("@g.us")) return raw;
  if (raw.endsWith("-group")) {
    const id = raw.slice(0, -"-group".length);
    if (/^\d+$/.test(id)) return `${id}@g.us`;
  }
  if (/^\d+-\d+$/.test(raw)) return `${raw}@g.us`;
  return null;
}

async function fetchZapiNamesByJid(base, inst, token, clientToken) {
  const map = new Map();
  if (!inst || !token) return map;
  const root = `${String(base).replace(/\/$/, "")}/instances/${inst}/token/${token}`;
  const pageSize = 100;
  for (let page = 1; page < 500; page += 1) {
    const url = `${root}/groups?page=${page}&pageSize=${pageSize}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(clientToken ? { "Client-Token": clientToken } : {}),
      },
    });
    if (!res.ok) return map;
    const json = await res.json().catch(() => null);
    const arr = Array.isArray(json) ? json : [];
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const o = item;
      if (o.isGroup !== true && o.isGroup !== "true") continue;
      const listPhone = typeof o.phone === "string" ? o.phone.trim() : "";
      const name = typeof o.name === "string" ? o.name.trim() : "";
      const jid = canonicalFromZapiListPhone(listPhone);
      if (jid && name) map.set(jid, name);
    }
    if (arr.length === 0 || arr.length < pageSize) break;
  }
  return map;
}

async function mergeMessages(crm, fromId, toId, dryRun) {
  if (fromId === toId) return;
  if (dryRun) return;
  const { error: mErr } = await crm
    .from("messages")
    .update({ conversation_id: toId })
    .eq("conversation_id", fromId);
  if (mErr) throw mErr;
  const { error: dErr } = await crm.from("conversations").delete().eq("id", fromId);
  if (dErr) throw dErr;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function main() {
  const { dryRun, file: fileArg } = parseArgs();
  const repoRoot = path.join(__dirname, "..");
  const defaultFile = path.join(repoRoot, "scripts", "group-merge-input.csv");
  const filePath = fileArg
    ? path.isAbsolute(fileArg)
      ? fileArg
      : path.join(repoRoot, fileArg)
    : defaultFile;

  if (!fs.existsSync(filePath)) {
    console.error(
      `Arquivo não encontrado: ${filePath}\n` +
        "Crie o CSV ou passe: --file scripts/examples/group-merge-example.csv",
    );
    process.exit(1);
  }

  const env = {
    ...loadEnv(path.join(repoRoot, ".env.local")),
    ...loadEnv(path.join(repoRoot, "apps", "crm", ".env.local")),
  };
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = env.SERVICE_ROLE || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) {
    throw new Error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  }

  const zapiBase = env.ZAPI_BASE_URL || "https://api.z-api.io";
  const zapiNames = await fetchZapiNamesByJid(
    zapiBase,
    env.ZAPI_INSTANCE_ID,
    env.ZAPI_TOKEN,
    env.ZAPI_CLIENT_TOKEN,
  );

  const raw = fs.readFileSync(filePath, "utf8");
  const rowsAll = parseCsv(raw);
  const rows = rowsAll.filter((r, idx) => {
    if (idx === 0) return true;
    const first = (r[0] ?? "").trim();
    if (!first || first.startsWith("#")) return false;
    return true;
  });
  if (rows.length < 1) {
    throw new Error("CSV inválido ou sem cabeçalho.");
  }
  if (rows.length < 2) {
    console.info("[merge-guided-groups] Nenhuma linha de dados (só cabeçalho). Nada a fazer.");
    process.exit(0);
  }
  const header = rows[0].map((h) => h.toLowerCase());
  const idIdx = header.indexOf("conversation_id");
  const jidIdx = header.indexOf("group_jid");
  const nameIdx = header.indexOf("group_display_name");
  if (idIdx < 0 || jidIdx < 0) {
    throw new Error('Cabeçalho precisa conter colunas "conversation_id" e "group_jid".');
  }

  const crm = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).schema("crm");

  let ok = 0;
  let skipped = 0;

  for (let i = 1; i < rows.length; i += 1) {
    const line = rows[i];
    const conversationId = line[idIdx]?.trim() ?? "";
    const groupJidRaw = line[jidIdx]?.trim() ?? "";
    const nameFromCsv =
      nameIdx >= 0 && line[nameIdx] != null ? String(line[nameIdx]).trim() : "";

    if (!conversationId && !groupJidRaw) continue;

    if (!UUID_RE.test(conversationId)) {
      console.warn(`Linha ${i + 1}: conversation_id inválido, ignorada.`);
      skipped += 1;
      continue;
    }

    const jid = normalizeGroupJid(groupJidRaw);
    if (!jid) {
      console.warn(`Linha ${i + 1}: group_jid precisa conter @g.us, ignorada.`);
      skipped += 1;
      continue;
    }

    const { data: conv, error: cErr } = await crm
      .from("conversations")
      .select("id, channel, conversation_kind, phone_e164, group_display_name")
      .eq("id", conversationId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!conv) {
      console.warn(`Linha ${i + 1}: conversa ${conversationId} não encontrada.`);
      skipped += 1;
      continue;
    }
    if (conv.channel !== "whatsapp" || conv.conversation_kind !== "group") {
      console.warn(
        `Linha ${i + 1}: conversa ${conversationId} não é whatsapp/group, ignorada.`,
      );
      skipped += 1;
      continue;
    }

    let displayName = nameFromCsv || zapiNames.get(jid) || null;

    const { data: dup } = await crm
      .from("conversations")
      .select("id, group_display_name")
      .eq("channel", "whatsapp")
      .eq("phone_e164", jid)
      .neq("id", conversationId)
      .maybeSingle();

    if (dup?.id) {
      console.info(
        `[merge] ${conversationId} → conversa existente ${dup.id} (${jid})` +
          (dryRun ? " (dry-run)" : ""),
      );
      if (!dryRun) {
        await mergeMessages(crm, conversationId, dup.id, false);
        const patch = { updated_at: new Date().toISOString() };
        if (displayName) patch.group_display_name = displayName;
        else if (!(dup.group_display_name ?? "").trim() && zapiNames.get(jid)) {
          patch.group_display_name = zapiNames.get(jid);
        }
        if (Object.keys(patch).length > 1) {
          const { error: uErr } = await crm.from("conversations").update(patch).eq("id", dup.id);
          if (uErr) throw uErr;
        }
      }
      ok += 1;
      continue;
    }

    const patch = {
      phone_e164: jid,
      updated_at: new Date().toISOString(),
    };
    if (displayName) patch.group_display_name = displayName;

    if (dryRun) {
      console.info(
        `[dry-run] ${conversationId}: phone → ${jid}` +
          (displayName ? `, nome → "${displayName}"` : ""),
      );
    } else {
      const { error: uErr } = await crm.from("conversations").update(patch).eq("id", conversationId);
      if (uErr) throw uErr;
    }
    ok += 1;
  }

  console.info("[merge-guided-groups] Concluído:", { aplicadas: ok, ignoradas: skipped, dryRun });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
