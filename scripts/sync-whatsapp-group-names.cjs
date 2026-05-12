/**
 * Sincroniza `crm.conversations.group_display_name` com a Z-API (GET /groups).
 *
 * - Casamento direto: `phone_e164` já no formato `...@g.us` (igual ao CRM após ingest correto).
 * - Reconciliação opcional (E.164 “errado” no CRM): só quando o número bate com **owner**
 *   do metadata do grupo (um dono por grupo → menos ambiguidade que participantes).
 *   Ative com: SYNC_GROUPS_RECONCILE_OWNER=1
 *
 * Se ao corrigir `phone_e164` já existir outra conversa com o mesmo JID, as mensagens são
 * movidas para a conversa existente e a duplicata é removida (evita erro 23505).
 *
 * Uso:
 *   node scripts/sync-whatsapp-group-names.cjs
 *   node scripts/sync-whatsapp-group-names.cjs --dry-run
 *   SYNC_GROUPS_RECONCILE_OWNER=1 node scripts/sync-whatsapp-group-names.cjs
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

function digitsOnly(s) {
  return String(s ?? "").replace(/\D/g, "");
}

function crmPhoneMatchKeys(phoneE164) {
  const d = digitsOnly(phoneE164);
  const keys = new Set();
  if (d) keys.add(d);
  if (d.length >= 11) keys.add(d.slice(-11));
  if (d.startsWith("55") && d.length > 11) keys.add(d.slice(2));
  return keys;
}

function canonicalGroupJidFromZapiListPhone(phone) {
  const raw = String(phone ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!raw) return null;
  if (raw.includes("@g.us")) return raw;
  if (raw.endsWith("-group")) {
    const id = raw.slice(0, -"-group".length);
    if (/^\d+$/.test(id)) return `${id}@g.us`;
  }
  if (/^\d+-\d+$/.test(raw)) return `${raw}@g.us`;
  return null;
}

function canonicalGroupJidFromCrmPhoneE164(phoneE164) {
  const raw = String(phoneE164 ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!raw) return null;
  if (raw.includes("@g.us")) return raw;
  return null;
}

async function fetchZapiGroupsPages(base, inst, token, clientToken) {
  const root = `${base.replace(/\/$/, "")}/instances/${inst}/token/${token}`;
  const pageSize = 100;
  const rows = [];
  for (let page = 1; page < 500; page += 1) {
    const url = `${root}/groups?page=${page}&pageSize=${pageSize}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(clientToken ? { "Client-Token": clientToken } : {}),
      },
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Z-API /groups falhou: ${res.status} ${t.slice(0, 500)}`);
    }
    const json = await res.json().catch(() => null);
    const arr = Array.isArray(json) ? json : [];
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const o = item;
      if (o.isGroup !== true && o.isGroup !== "true") continue;
      const listPhone = typeof o.phone === "string" ? o.phone.trim() : "";
      const name = typeof o.name === "string" ? o.name.trim() : "";
      const jid = canonicalGroupJidFromZapiListPhone(listPhone);
      if (listPhone && jid && name) rows.push({ listPhone, listName: name, jid });
    }
    if (arr.length === 0 || arr.length < pageSize) break;
  }
  return rows;
}

async function fetchGroupMetadata(base, inst, token, clientToken, listPhone) {
  const root = `${base.replace(/\/$/, "")}/instances/${inst}/token/${token}`;
  const enc = encodeURIComponent(String(listPhone).trim());
  const url = `${root}/group-metadata/${enc}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        ...(clientToken ? { "Client-Token": clientToken } : {}),
      },
    });
    if (!res.ok) return null;
    return res.json().catch(() => null);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function mergeConversationInto(crm, fromId, toId, dryRun) {
  if (fromId === toId) return;
  if (dryRun) {
    console.info(`[dry-run] merge mensagens ${fromId} → ${toId}`);
    return;
  }
  const { error: mErr } = await crm
    .from("messages")
    .update({ conversation_id: toId })
    .eq("conversation_id", fromId);
  if (mErr) throw mErr;
  const { error: dErr } = await crm.from("conversations").delete().eq("id", fromId);
  if (dErr) throw dErr;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const reconcileOwner = process.env.SYNC_GROUPS_RECONCILE_OWNER === "1";
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
    throw new Error(
      "Env incompleto. Precisa de NEXT_PUBLIC_SUPABASE_URL (ou SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY, ZAPI_INSTANCE_ID e ZAPI_TOKEN.",
    );
  }

  console.info("[sync-group-names] Buscando grupos na Z-API (/groups)…");
  const groupRows = await fetchZapiGroupsPages(zapiBase, zapiInstanceId, zapiToken, zapiClientToken);
  const zapiByJid = new Map();
  for (const r of groupRows) zapiByJid.set(r.jid, r.listName);
  console.info(`[sync-group-names] Grupos na Z-API (com nome): ${zapiByJid.size}`);

  const crm = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).schema("crm");

  const { data: convs, error } = await crm
    .from("conversations")
    .select("id, phone_e164, group_display_name")
    .eq("channel", "whatsapp")
    .eq("conversation_kind", "group");
  if (error) throw error;

  let updated = 0;
  let skippedNoChange = 0;
  let skippedNoMatch = 0;
  let merged = 0;

  /** Fase 1 — JID já correto */
  for (const row of convs ?? []) {
    const jid = canonicalGroupJidFromCrmPhoneE164(row.phone_e164);
    if (!jid) continue;
    const name = zapiByJid.get(jid);
    if (!name) {
      skippedNoMatch += 1;
      continue;
    }
    if ((row.group_display_name ?? "").trim() === name) {
      skippedNoChange += 1;
      continue;
    }
    if (dryRun) {
      console.info(`[dry-run] nome ${row.id} ${jid} → "${name}"`);
    } else {
      const { error: upErr } = await crm
        .from("conversations")
        .update({
          group_display_name: name,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (upErr) throw upErr;
    }
    updated += 1;
  }

  /** Fase 2 — opcional: E.164 = owner do grupo (match único) */
  if (reconcileOwner) {
    console.info("[sync-group-names] Fase 2 (owner): buscando metadata…");
    const metaByListPhone = new Map();
    for (let i = 0; i < groupRows.length; i += 1) {
      const gr = groupRows[i];
      const meta = await fetchGroupMetadata(
        zapiBase,
        zapiInstanceId,
        zapiToken,
        zapiClientToken,
        gr.listPhone,
      );
      metaByListPhone.set(gr.listPhone, meta);
      if ((i + 1) % 5 === 0) {
        console.info(`[sync-group-names] metadata ${i + 1}/${groupRows.length}`);
      }
      await new Promise((r) => setTimeout(r, 80));
    }

    const badRows = (convs ?? []).filter((r) => !canonicalGroupJidFromCrmPhoneE164(r.phone_e164));
    for (const row of badRows) {
      const keys = crmPhoneMatchKeys(row.phone_e164);
      if (keys.size === 0) continue;

      const candidates = [];
      for (const gr of groupRows) {
        const meta = metaByListPhone.get(gr.listPhone);
        if (!meta || typeof meta !== "object") continue;
        const od = digitsOnly(meta.owner);
        let hit = false;
        for (const k of keys) {
          if (k && od && (od === k || od.endsWith(k) || k.endsWith(od))) {
            hit = true;
            break;
          }
        }
        if (!hit) continue;
        const subject =
          typeof meta.subject === "string" && meta.subject.trim()
            ? meta.subject.trim()
            : gr.listName;
        const metaPhone = typeof meta.phone === "string" ? meta.phone.trim() : gr.listPhone;
        const jid = canonicalGroupJidFromZapiListPhone(metaPhone) ?? gr.jid;
        candidates.push({ jid, subject });
      }

      if (candidates.length !== 1) {
        if (candidates.length > 1) {
          console.warn(
            `[sync-group-names] owner ambíguo: ${row.id} (${row.phone_e164}) → ${candidates.length} grupos; ignorado.`,
          );
        } else skippedNoMatch += 1;
        continue;
      }

      const { jid, subject } = candidates[0];
      const { data: existing } = await crm
        .from("conversations")
        .select("id")
        .eq("channel", "whatsapp")
        .eq("phone_e164", jid)
        .neq("id", row.id)
        .maybeSingle();

      if (existing?.id) {
        console.info(`[sync-group-names] merge ${row.id} → existente ${existing.id} (${jid})`);
        await mergeConversationInto(crm, row.id, existing.id, dryRun);
        merged += 1;
        if (!dryRun) {
          const { error: upErr } = await crm
            .from("conversations")
            .update({
              group_display_name: subject,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
          if (upErr) throw upErr;
        }
        updated += 1;
        continue;
      }

      if (
        (row.group_display_name ?? "").trim() === subject &&
        canonicalGroupJidFromCrmPhoneE164(row.phone_e164) === jid
      ) {
        skippedNoChange += 1;
        continue;
      }

      if (dryRun) {
        console.info(
          `[dry-run] owner ${row.id} "${row.phone_e164}" → jid ${jid}, nome "${subject}"`,
        );
      } else {
        const { error: upErr } = await crm
          .from("conversations")
          .update({
            group_display_name: subject,
            phone_e164: jid,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        if (upErr) throw upErr;
      }
      updated += 1;
    }
  } else {
    const bad = (convs ?? []).filter((r) => !canonicalGroupJidFromCrmPhoneE164(r.phone_e164)).length;
    if (bad > 0) {
      console.info(
        `[sync-group-names] ${bad} conversa(s) sem JID …@g.us. Corrija com ingest + novas mensagens, ou rode com SYNC_GROUPS_RECONCILE_OWNER=1 (só casa com owner do grupo).`,
      );
    }
  }

  console.info("[sync-group-names] Resumo:", {
    conversasGrupo: (convs ?? []).length,
    atualizadasOuMescladas: updated,
    merges: merged,
    semMudanca: skippedNoChange,
    semMatch: skippedNoMatch,
    reconcileOwner,
    dryRun,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
