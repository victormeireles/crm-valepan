import { normalizeBrazilPhoneToE164 } from "@crm/shared/phone";
import { agentDebugLog } from "@/lib/agent-debug-log";
import { crmTables, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { fetchZapiProfilePictureLink } from "@/lib/zapi/profile-picture";

/** Fallback quando o JID não é BR mas tem dígitos E.164 válidos (ex.: +351, +1). */
function normalizeDigitsToE164Loose(digits: string): string | null {
  if (digits.length < 8 || digits.length > 15) return null;
  if (!/^[1-9]\d+$/.test(digits)) return null;
  return `+${digits}`;
}

/**
 * Chave única para `crm.conversations.phone_e164`: E.164 (`+55…`) ou `lid:123` quando o webhook só traz `@lid`
 * (WhatsApp privacidade — ver developer.z-api.io/tips/lid).
 */
function normalizeZapiChatKey(phoneCandidate: string): string | null {
  const t = phoneCandidate.trim();
  if (!t) return null;
  if (t.toLowerCase().includes("@g.us")) {
    return t.toLowerCase().replace(/\s+/g, "");
  }
  if (t.toLowerCase().includes("@lid")) {
    const digits = (t.split("@")[0] ?? "").replace(/\D/g, "");
    if (digits.length < 8) return null;
    return `lid:${digits}`;
  }
  const stripped = t.replace(/@.*/, "");
  let n = normalizeBrazilPhoneToE164(stripped);
  if (!n) n = normalizeDigitsToE164Loose(stripped.replace(/\D/g, ""));
  return n;
}

/** Todos os `lid:…` presentes no payload (phone/chatLid/senderLid…) para gravar em zapi_lid_map quando houver E.164 real. */
function collectLinkedLidKeysFromMerged(o: Record<string, unknown>): string[] {
  const found: string[] = [];
  for (const f of ["phone", "chatLid", "senderLid", "participantLid"] as const) {
    const v = o[f];
    if (typeof v !== "string" || !v.trim()) continue;
    const k = normalizeZapiChatKey(v.trim());
    if (k?.startsWith("lid:")) found.push(k);
  }
  return [...new Set(found)];
}

/** Formato flexível do webhook Z-API (campos podem variar por evento). */
export type ZapiInbound = {
  phoneRaw: string;
  /** E.164 (`+55…`) ou chave sintética `lid:123…` quando o WhatsApp só envia `@lid`. */
  phoneE164: string;
  /** Campo usado em `pickPhoneCandidate` (diagnóstico). */
  pickSource?: string;
  /** LIDs no mesmo evento que o número real (recebidas costumam trazer os dois). */
  linkedLidKeys?: string[];
  /** Nome do contato quando disponível no webhook (chatName/senderName). */
  contactName?: string | null;
  /** Nome do grupo quando o webhook trouxer subject/chatName. */
  groupDisplayName?: string | null;
  /** Status simplificado para mensagens de saída. */
  messageStatus?: "sent" | "read" | null;
  messageId: string | null;
  body: string | null;
  fromMe: boolean;
  /** Ex.: `ReceivedCallback`, `DeliveryCallback` (envio — vem sem `fromMe` na doc Z-API). */
  eventType: string | null;
  /** Quando o payload traz timestamp (ex.: momment/moment em ms). */
  sentAtIso: string | null;
  /** Separa conversa de lead individual de grupo do WhatsApp. */
  conversationKind: "lead" | "group";
  media:
    | {
        kind: "image" | "video" | "audio" | "document";
        url: string | null;
        mimeType: string | null;
        fileName: string | null;
      }
    | null;
};

function extractSentAtIso(source: Record<string, unknown> | null): string | null {
  if (!source) return null;
  const tryParse = (v: unknown): string | null => {
    if (typeof v === "number" && Number.isFinite(v)) {
      const ms = v < 1e12 ? v * 1000 : v;
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    if (typeof v === "string" && v.trim()) {
      const n = Number(v);
      if (!Number.isNaN(n) && String(n) === v.trim()) return tryParse(n);
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    return null;
  };
  for (const key of ["momment", "moment", "messageTimestamp", "timestamp", "t"] as const) {
    if (key in source) {
      const iso = tryParse(source[key]);
      if (iso) return iso;
    }
  }
  return null;
}

/**
 * Alguns proxies / versões da Z-API enviam metadados na raiz (`type`, `instanceId`) e o
 * conteúdo em `data` ou `payload`.
 *
 * **Ordem do spread:** `data`/`payload` deve prevalecer sobre a raiz. Com `{ ...inner, ...rootRest }`,
 * um `key: {}` ou `phone` vazio na raiz **apagava** `key.remoteJid` vindo do Baileys dentro de `data`
 * → `parse_failed` e mensagens recebidas nunca gravadas.
 */
function shallowKeyRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return { ...(v as Record<string, unknown>) };
}

/**
 * Une `key` da raiz e de `data`/`payload` sem perder `remoteJid`: um `key` interno só com `id`
 * sobrescrevia o da raiz e o ingest caía em `phone` errado ou em dígitos que viravam +242….
 */
function mergePayloadLayers(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  const nested = root.data ?? root.payload;
  const inner =
    nested && typeof nested === "object" && nested !== null
      ? (nested as Record<string, unknown>)
      : {};
  const { data, payload, ...rootRest } = root;
  void data;
  void payload;
  const merged = { ...rootRest, ...inner };

  const rootKey = shallowKeyRecord(rootRest.key);
  const innerKey = shallowKeyRecord(inner.key);
  if (rootKey || innerKey) {
    const a = rootKey ?? {};
    const b = innerKey ?? {};
    const jidFromInner = pickJidFromKey({ key: b });
    const jidFromRoot = pickJidFromKey({ key: a });
    const jid = jidFromInner || jidFromRoot;
    merged.key = { ...a, ...b, ...(jid ? { remoteJid: jid } : {}) };
  }

  return merged;
}

/**
 * Baileys / WhatsApp Web: o JID do chat vem em `key.remoteJid` (ex.: 5511...@s.whatsapp.net).
 * **Nunca** usar `key.id` como telefone: é o ID da mensagem (muitas vezes só dígitos) e vira E.164 errado
 * via `normalizeDigitsToE164Loose` (ex.: +242… com 15 dígitos).
 */
function pickJidFromKey(o: Record<string, unknown>): string {
  const key = o.key;
  if (!key || typeof key !== "object" || key === null) return "";
  const k = key as Record<string, unknown>;
  for (const kk of ["remoteJid", "remote_jid", "participant"] as const) {
    const v = k[kk];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export type PhonePickTrace = { raw: string; pickSource: string };

/**
 * Z-API em webhooks «flat» (sem `key.remoteJid`) manda `phone` como LID / ID interno: só dígitos com
 * 14–15 caracteres — vira E.164 errado (+242…). Evidência: debug H7 `merged.phone` + digitLen 15 + fromMe.
 */
function isZapiJunkNumericPhoneScalar(raw: string): boolean {
  const t = raw.trim();
  if (t.includes("@")) return false;
  return t.replace(/\D/g, "").length >= 14;
}

function tryScalarPhoneField(
  v: unknown,
  pickSource: string,
): PhonePickTrace | null {
  if (typeof v === "string" && v.trim()) {
    const raw = v.trim();
    if (isZapiJunkNumericPhoneScalar(raw)) return null;
    return { raw, pickSource };
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    const raw = String(v);
    if (isZapiJunkNumericPhoneScalar(raw)) return null;
    return { raw, pickSource };
  }
  return null;
}

/**
 * Ordem: JID em `key` do merge → JID em `key` do JSON raiz (Z-API costuma manter Baileys na raiz) →
 * campos escalares no merge → mesmos campos na raiz (fallback).
 */
function pickPhoneCandidate(
  o: Record<string, unknown>,
  isGroup: boolean,
  participant: string,
  root: Record<string, unknown> | null,
): PhonePickTrace {
  /**
   * Em grupos, `participantPhone` costuma ser o remetente (E.164), não o chat.
   * Só usamos participante como chave quando **não** houver JID do grupo em `key.remoteJid`.
   */
  const fromMergedKey = pickJidFromKey(o);
  if (isGroup && fromMergedKey && fromMergedKey.toLowerCase().includes("@g.us")) {
    return { raw: fromMergedKey, pickSource: "merged.key.remoteJid_group" };
  }
  if (root) {
    const fromRootKey = pickJidFromKey(root);
    if (isGroup && fromRootKey && fromRootKey.toLowerCase().includes("@g.us")) {
      return { raw: fromRootKey, pickSource: "root.key.remoteJid_group" };
    }
  }

  if (isGroup && participant) return { raw: participant, pickSource: "participant_group" };

  if (fromMergedKey) return { raw: fromMergedKey, pickSource: "merged.key.remoteJid" };

  if (root) {
    const fromRootKey = pickJidFromKey(root);
    if (fromRootKey) return { raw: fromRootKey, pickSource: "root.key.remoteJid" };
  }

  /**
   * Z-API / WhatsApp: `phone` pode ser número ou `…@lid`; `chatLid` é o identificador estável (docs Z-API).
   * Só dígitos com ≥14 chars sem `@` continua sendo lixo (ID interno), não E.164.
   */
  const keys = [
    "participantPhone",
    "phone",
    "chatLid",
    "senderLid",
    "participantLid",
    "chatId",
    "remoteJid",
    "jid",
    "phoneNumber",
    "senderPhone",
  ] as const;
  for (const k of keys) {
    const hit = tryScalarPhoneField(o[k], `merged.${k}`);
    if (hit) return hit;
  }

  if (root) {
    for (const k of keys) {
      const hit = tryScalarPhoneField(root[k], `root.${k}`);
      if (hit) return hit;
    }
  }

  return { raw: "", pickSource: "none" };
}

function normalizeEventType(type: string | null): string | null {
  if (!type || typeof type !== "string") return null;
  const t = type.trim();
  return t.length ? t : null;
}

/** Status da mensagem, presença, conexão — mesma URL do inbox se o usuário colar a URL em tudo. */
const ZAPI_NON_MESSAGE_CALLBACKS = new Set([
  "connectedcallback",
  "disconnectedcallback",
  "presencechatcallback",
]);

const ZAPI_CHAT_CALLBACKS = new Set([
  "receivedcallback",
  "deliverycallback",
  "messagestatuscallback",
  /** variantes / proxies */
  "receivecallback",
  "messagereceived",
]);

/** Tipo do webhook em várias grafias/campos (Z-API, proxies, camelCase). */
function pickRawWebhookType(
  merged: Record<string, unknown>,
  root: Record<string, unknown> | null,
): string {
  const r = root ?? {};
  return (
    (typeof merged.type === "string" && merged.type) ||
    (typeof merged.Type === "string" && merged.Type) ||
    (typeof merged.event === "string" && merged.event) ||
    (typeof merged.Event === "string" && merged.Event) ||
    (typeof merged.webhookType === "string" && merged.webhookType) ||
    (typeof r.type === "string" && r.type) ||
    (typeof r.Type === "string" && r.Type) ||
    ""
  );
}

function hasLikelyChatMessageShape(o: Record<string, unknown>): boolean {
  if (o.text !== undefined && o.text !== null) return true;
  if (o.message !== undefined && o.message !== null) return true;
  const keys = [
    "image",
    "video",
    "audio",
    "document",
    "sticker",
    "location",
    "contact",
    "contacts",
    "interactive",
    "button_reply",
    "list_reply",
    "template",
    "ptv",
    "gif",
    "album",
    "event",
    "pinMessage",
    "reaction",
    "protocolMessage",
    "liveLocation",
    "order",
    "product",
    "catalog",
    "nativeFlow",
  ];
  for (const k of keys) {
    if (o[k] !== undefined && o[k] !== null) return true;
  }
  if (typeof o.messageId === "string" && o.messageId.length > 0) return true;
  return false;
}

function isTruthyGroupFlag(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

function isGroupJidLike(v: unknown): boolean {
  return typeof v === "string" && v.toLowerCase().includes("@g.us");
}

/**
 * Grupos no WhatsApp podem vir marcados por `isGroup` ou por JID `...@g.us`.
 * Bloqueamos ambos para manter o inbox somente com contatos 1:1.
 */
function isGroupPayload(
  merged: Record<string, unknown>,
  root: Record<string, unknown> | null,
): boolean {
  if (isTruthyGroupFlag(merged.isGroup) || isTruthyGroupFlag(root?.isGroup)) return true;
  const candidates = [
    pickJidFromKey(merged),
    root ? pickJidFromKey(root) : "",
    typeof merged.phone === "string" ? merged.phone : "",
    typeof merged.chatId === "string" ? merged.chatId : "",
    typeof root?.phone === "string" ? root.phone : "",
    typeof root?.chatId === "string" ? root.chatId : "",
  ];
  return candidates.some((x) => isGroupJidLike(x));
}

/**
 * Ignora eventos que não são mensagem de chat (doc Z-API).
 * Evita 400/500 e “mensagens fantasmas” (ex.: só status READ/SENT).
 */
export function planZapiWebhookAction(
  body: unknown,
): { action: "skip"; reason: string } | { action: "parse" } {
  if (!body || typeof body !== "object") return { action: "parse" };
  const root = body as Record<string, unknown>;
  const merged = mergePayloadLayers(body);
  if (!merged) return { action: "parse" };

  const rawType = pickRawWebhookType(merged, root);
  const t = rawType.trim().toLowerCase();

  /** Sem `type`, não deduzir skip por `notification` — senão ignorávamos recebidos válidos. */
  if (!t) return { action: "parse" };

  if (typeof root.notification === "string" && root.notification.length > 0) {
    if (!ZAPI_CHAT_CALLBACKS.has(t)) {
      return { action: "skip", reason: `notification:${root.notification}` };
    }
  }

  if (ZAPI_NON_MESSAGE_CALLBACKS.has(t)) {
    return { action: "skip", reason: `callback:${rawType}` };
  }

  if (ZAPI_CHAT_CALLBACKS.has(t)) return { action: "parse" };

  const isGroup = isGroupPayload(merged, root);
  const participant =
    typeof merged.participantPhone === "string" && merged.participantPhone.trim()
      ? merged.participantPhone.trim()
      : "";
  const hasPhone = pickPhoneCandidate(merged, isGroup, participant, root).raw !== "";

  if (hasLikelyChatMessageShape(merged) && hasPhone) {
    return { action: "parse" };
  }

  return { action: "skip", reason: `unsupported_callback:${rawType}` };
}

function s(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function normalizeMaybeUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return null;
}

function pickFirstUrlFromObject(obj: Record<string, unknown>): string | null {
  for (const key of [
    "url",
    "link",
    "downloadUrl",
    "download_url",
    "fileUrl",
    "file_url",
    "mediaUrl",
    "media_url",
    "directPath",
  ] as const) {
    const hit = normalizeMaybeUrl(obj[key]);
    if (hit) return hit;
  }
  return null;
}

function extractMediaMeta(
  o: Record<string, unknown>,
  depth = 0,
):
  | {
      kind: "image" | "video" | "audio" | "document";
      url: string | null;
      mimeType: string | null;
      fileName: string | null;
    }
  | null {
  if (depth > 4) return null;
  const blocks: Array<{ kind: "image" | "video" | "audio" | "document"; value: unknown }> = [
    { kind: "image", value: o.image },
    { kind: "video", value: o.video },
    { kind: "audio", value: o.audio },
    { kind: "document", value: o.document },
  ];
  for (const block of blocks) {
    if (!block.value || typeof block.value !== "object" || Array.isArray(block.value)) continue;
    const data = block.value as Record<string, unknown>;
    const mimeType =
      s(data.mimetype) ?? s(data.mimeType) ?? s(data.mime_type) ?? null;
    const fileName = s(data.fileName) ?? s(data.filename) ?? s(data.name) ?? null;
    const url = pickFirstUrlFromObject(data);
    return { kind: block.kind, url, mimeType, fileName };
  }
  for (const wrap of [
    "message",
    "ephemeralMessage",
    "viewOnceMessage",
    "documentWithCaptionMessage",
  ] as const) {
    const inner = o[wrap];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      const hit = extractMediaMeta(inner as Record<string, unknown>, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

function looksLikePhoneOrJidLabel(name: string): boolean {
  const t = name.trim().toLowerCase();
  if (!t) return true;
  if (t.includes("@lid") || t.includes("@s.whatsapp.net") || t.includes("@g.us")) return true;
  const digits = t.replace(/\D/g, "");
  if (digits.length >= 8 && !/[a-zA-Z\u00C0-\u024F]/.test(t)) return true;
  return false;
}

function normalizeContactNameCandidate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ");
  if (!t) return null;
  if (looksLikePhoneOrJidLabel(t)) return null;
  if (t.length > 140) return t.slice(0, 140);
  return t;
}

function normalizeGroupDisplayNameCandidate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ");
  if (!t) return null;
  if (t.includes("@g.us") || t.includes("@s.whatsapp.net") || t.includes("@lid")) return null;
  /** Não usar rótulo que é só número (costuma ser telefone, não nome do grupo). */
  if (looksLikePhoneOrJidLabel(t)) return null;
  if (t.length > 140) return t.slice(0, 140);
  return t;
}

/**
 * Para mensagens enviadas (`fromMe=true`), `chatName` costuma ser o nome do destinatário.
 * Para recebidas, priorizamos `senderName`.
 */
function extractContactName(
  merged: Record<string, unknown>,
  root: Record<string, unknown> | null,
  fromMe: boolean,
): string | null {
  const m = merged;
  const r = root ?? {};
  const ordered = fromMe
    ? [m.chatName, r.chatName, m.pushName, r.pushName]
    : [m.senderName, r.senderName, m.chatName, r.chatName, m.pushName, r.pushName];
  for (const c of ordered) {
    const name = normalizeContactNameCandidate(c);
    if (name) return name;
  }
  return null;
}

function extractGroupDisplayNameFromRecord(rec: Record<string, unknown> | null): string | null {
  if (!rec) return null;
  const flatKeys = [
    "groupName",
    "subject",
    "chatName",
    "name",
    "title",
    "displayName",
    "notify",
    "notifyName",
    "whatsappName",
    "verifiedName",
  ] as const;
  for (const k of flatKeys) {
    const parsed = normalizeGroupDisplayNameCandidate(rec[k]);
    if (parsed) return parsed;
  }
  const chat = rec.chat;
  if (chat && typeof chat === "object" && !Array.isArray(chat)) {
    const c = chat as Record<string, unknown>;
    for (const k of ["name", "subject", "displayName"] as const) {
      const parsed = normalizeGroupDisplayNameCandidate(c[k]);
      if (parsed) return parsed;
    }
  }
  const gm = rec.groupMetadata;
  if (gm && typeof gm === "object" && !Array.isArray(gm)) {
    const parsed = normalizeGroupDisplayNameCandidate((gm as Record<string, unknown>).subject);
    if (parsed) return parsed;
  }
  return null;
}

function extractGroupDisplayName(
  merged: Record<string, unknown>,
  root: Record<string, unknown> | null,
): string | null {
  return extractGroupDisplayNameFromRecord(merged) ?? extractGroupDisplayNameFromRecord(root);
}

/** Variações de `phone` aceitas no path GET …/group-metadata/{phone} (doc Z-API). */
function zapiGroupMetadataPhoneCandidates(jidLower: string): string[] {
  const j = jidLower.trim().toLowerCase();
  const hyphen = /^([\d]+-[\d]+)@g\.us$/i.exec(j);
  if (hyphen?.[1]) {
    return [hyphen[1], j];
  }
  const plain = /^(\d+)@g\.us$/i.exec(j);
  if (plain?.[1]) {
    const d = plain[1];
    return [`${d}-group`, d, j];
  }
  return [j];
}

const groupSubjectCache = new Map<string, string>();
const groupSubjectMiss = new Set<string>();

/**
 * Busca o nome (subject) do grupo na Z-API quando o webhook não traz título suficiente.
 * Usa cache em memória por processo para não martelar a API a cada mensagem.
 */
async function fetchZapiGroupSubjectByJid(groupJid: string): Promise<string | null> {
  const key = groupJid.trim().toLowerCase();
  if (groupSubjectCache.has(key)) return groupSubjectCache.get(key)!;
  if (groupSubjectMiss.has(key)) return null;

  const base = process.env.ZAPI_BASE_URL ?? "https://api.z-api.io";
  const inst = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;
  if (!inst || !token) {
    groupSubjectMiss.add(key);
    return null;
  }

  const rootUrl = `${base.replace(/\/$/, "")}/instances/${inst}/token/${token}`;
  const candidates = zapiGroupMetadataPhoneCandidates(key);

  for (const phonePart of candidates) {
    const url = `${rootUrl}/group-metadata/${encodeURIComponent(phonePart)}`;
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 12_000);
    try {
      const res = await fetch(url, {
        method: "GET",
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          ...(clientToken ? { "Client-Token": clientToken } : {}),
        },
      });
      if (!res.ok) continue;
      const raw: unknown = await res.json().catch(() => null);
      if (!raw || typeof raw !== "object") continue;
      const sub = (raw as { subject?: unknown }).subject;
      if (typeof sub !== "string" || !sub.trim()) continue;
      const cleaned = sub.trim().replace(/\s+/g, " ");
      const out = cleaned.length > 140 ? cleaned.slice(0, 140) : cleaned;
      groupSubjectCache.set(key, out);
      return out;
    } catch {
      // tenta próxima variação
    } finally {
      clearTimeout(to);
    }
  }

  groupSubjectMiss.add(key);
  return null;
}

function extractMessageStatus(
  merged: Record<string, unknown>,
  root: Record<string, unknown> | null,
): "sent" | "read" | null {
  const bucket = [merged.status, root?.status, merged.messageStatus, root?.messageStatus];
  for (const raw of bucket) {
    if (typeof raw !== "string") continue;
    const low = raw.trim().toLowerCase();
    if (!low) continue;
    if (low.includes("read") || low === "opened" || low === "open") return "read";
    if (low.includes("sent") || low.includes("delivery") || low.includes("delivered")) return "sent";
  }
  return null;
}

/**
 * Texto, legenda ou rótulo legível para qualquer tipo de mensagem Z-API (mídia sem legenda, figurinha, etc.).
 * Evita gravar `body` vazio e aparecer só "—" no Inbox.
 */
function extractMessageText(o: Record<string, unknown>, depth = 0): string | null {
  if (depth > 4) return null;
  if (typeof o.text === "string" && o.text.trim()) return o.text.trim();
  if (o.text && typeof o.text === "object") {
    const t = o.text as Record<string, unknown>;
    const line =
      s(t.message) ?? s(t.description) ?? s(t.title) ?? s(t.caption);
    if (line) return line;
  }
  if (s(o.body)) return s(o.body)!;

  for (const key of ["image", "video", "document", "audio", "sticker", "ptv", "gif"] as const) {
    const block = o[key];
    if (block && typeof block === "object") {
      const b = block as Record<string, unknown>;
      const cap = s(b.caption);
      if (cap) return cap;
      if (key === "document") {
        const fn = s(b.fileName) ?? s(b.filename);
        if (fn) return `[Documento] ${fn}`;
      }
    }
  }

  if (o.image && typeof o.image === "object") return "[Imagem]";
  if (o.video && typeof o.video === "object") return "[Vídeo]";
  if (o.ptv && typeof o.ptv === "object") return "[Vídeo instantâneo]";
  if (o.gif && typeof o.gif === "object") return "[GIF]";
  if (o.audio && typeof o.audio === "object") return "[Áudio]";
  if (o.sticker && typeof o.sticker === "object") return "[Figurinha]";
  if (o.document && typeof o.document === "object") return "[Documento]";
  if (o.location || o.liveLocation) return "[Localização]";
  if (o.contact || o.contacts) return "[Contato]";

  if (o.reaction && typeof o.reaction === "object") {
    const r = o.reaction as Record<string, unknown>;
    const em =
      s(r.text) ?? (typeof r.reaction === "string" ? r.reaction.trim() || null : null);
    return em ? `Reação: ${em}` : "[Reação]";
  }

  if (o.buttonsResponseMessage && typeof o.buttonsResponseMessage === "object") {
    return "[Resposta de botão]";
  }
  if (o.listResponseMessage && typeof o.listResponseMessage === "object") {
    return "[Resposta de lista]";
  }
  if (o.interactive && typeof o.interactive === "object") {
    return "[Mensagem interativa]";
  }
  if (o.template && typeof o.template === "object") {
    return "[Template]";
  }

  if (o.protocolMessage && typeof o.protocolMessage === "object") {
    return "[Atualização de mensagem]";
  }
  if (o.pinMessage && typeof o.pinMessage === "object") {
    return "[Fixar mensagem]";
  }

  if (Array.isArray(o.album) && o.album.length > 0) {
    return "[Álbum de mídia]";
  }

  /** Wrappers comuns em payloads Baileys / variantes */
  for (const wrap of [
    "extendedTextMessage",
    "conversation",
    "ephemeralMessage",
    "viewOnceMessage",
    "documentWithCaptionMessage",
    "buttonsMessage",
    "listMessage",
    "templateMessage",
  ] as const) {
    const block = o[wrap];
    if (block && typeof block === "object") {
      const inner = extractMessageText(block as Record<string, unknown>, depth + 1);
      if (inner) return inner;
    }
  }

  if (o.message && typeof o.message === "object" && !Array.isArray(o.message)) {
    const inner = extractMessageText(o.message as Record<string, unknown>, depth + 1);
    if (inner) return inner;
  }

  return null;
}

/**
 * Baileys / Z-API: `key.fromMe` costuma ser a fonte correta; a raiz pode faltar ou divergir.
 */
function pickFromMeRaw(o: Record<string, unknown>): unknown {
  const key = o.key;
  if (key && typeof key === "object" && key !== null) {
    const k = key as Record<string, unknown>;
    if (k.fromMe !== undefined) return k.fromMe;
    if (k.from_me !== undefined) return k.from_me;
  }
  return o.fromMe ?? o.from_me ?? o.isFromMe;
}

function parseFromMeFlag(o: Record<string, unknown>, eventTypeLower: string): boolean {
  if (eventTypeLower === "deliverycallback") return true;
  const v = pickFromMeRaw(o);
  if (v === false || v === "false" || v === 0 || v === "0") return false;
  if (v === true || v === "true" || v === 1 || v === "1") return true;
  /** Webhooks de «mensagem recebida» (vários nomes na Z-API / proxies). */
  if (
    eventTypeLower === "receivedcallback" ||
    eventTypeLower === "receivecallback" ||
    eventTypeLower === "messagereceived"
  ) {
    return false;
  }
  return false;
}

export function parseZapiWebhookPayload(body: unknown): ZapiInbound | null {
  const o = mergePayloadLayers(body);
  if (!o) return null;

  const root =
    body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const sentAtIso = extractSentAtIso(o) ?? extractSentAtIso(root);

  const rawType = pickRawWebhookType(o, root);
  const eventType = normalizeEventType(rawType.length ? rawType : null);

  const isGroup = isGroupPayload(o, root);
  const participant =
    typeof o.participantPhone === "string" && o.participantPhone.trim()
      ? o.participantPhone.trim()
      : "";

  const phonePick = pickPhoneCandidate(o, isGroup, participant, root);
  const phoneCandidate = phonePick.raw;

  // #region agent log
  const evLower = eventType?.toLowerCase() ?? "";
  agentDebugLog({
    location: "ingest.ts:parseZapiWebhookPayload:phone_pick",
    message: "phone_candidate",
    hypothesisId: "H7",
    data: {
      pickSource: phonePick.pickSource,
      digitLen: phoneCandidate.replace(/\D/g, "").length,
      fromMe: parseFromMeFlag(o, evLower),
      eventType: evLower.slice(0, 40),
    },
  });
  // #endregion

  if (!phoneCandidate) {
    const fallbackMessageId =
      (typeof o.messageId === "string" && o.messageId) ||
      (typeof o.zaapId === "string" && o.zaapId) ||
      (typeof o.id === "string" && o.id) ||
      null;
    const fallbackStatus = extractMessageStatus(o, root);
    if (eventType?.toLowerCase() === "messagestatuscallback" && fallbackMessageId && fallbackStatus) {
      return {
        phoneRaw: "",
        phoneE164: "__status_only__",
        pickSource: "status_callback",
        linkedLidKeys: [],
        contactName: null,
        groupDisplayName: null,
        messageStatus: fallbackStatus,
        messageId: fallbackMessageId,
        body: null,
        fromMe: true,
        eventType,
        sentAtIso,
        conversationKind: "lead",
        media: null,
      };
    }
    return null;
  }

  const normalized = normalizeZapiChatKey(phoneCandidate);
  if (!normalized) return null;

  const text = extractMessageText(o);
  if (text === null) {
    const keys = Object.keys(o).sort().join(", ");
    console.warn(
      "[zapi ingest] Nenhum texto extraído do payload — chaves presentes:",
      keys || "(vazio)",
    );
  }

  const messageId =
    (typeof o.messageId === "string" && o.messageId) ||
    (typeof o.zaapId === "string" && o.zaapId) ||
    (typeof o.id === "string" && o.id) ||
    null;

  const ev = eventType?.toLowerCase() ?? "";
  const fromMe = parseFromMeFlag(o, ev);
  const contactName = extractContactName(o, root, fromMe);
  const messageStatus = extractMessageStatus(o, root);
  const conversationKind = isGroup ? "group" : "lead";
  const groupDisplayName =
    conversationKind === "group" ? extractGroupDisplayName(o, root) : null;

  return {
    phoneRaw: phoneCandidate,
    phoneE164: normalized,
    pickSource: phonePick.pickSource,
    linkedLidKeys: collectLinkedLidKeysFromMerged(o),
    contactName,
    messageId,
    body: text,
    fromMe,
    eventType,
    sentAtIso,
    conversationKind,
    groupDisplayName,
    messageStatus,
    media: extractMediaMeta(o),
  };
}

/** Diagnóstico para logs quando `parseZapiWebhookPayload` devolve null. */
export function describeZapiParseFailure(body: unknown): string {
  const o = mergePayloadLayers(body);
  if (!o) return "merge: JSON inválido ou não-objeto.";
  const root = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const isGroup = o.isGroup === true || o.isGroup === "true";
  const participant =
    typeof o.participantPhone === "string" && o.participantPhone.trim()
      ? o.participantPhone.trim()
      : "";
  const phone = pickPhoneCandidate(o, isGroup, participant, root).raw;
  if (!phone) {
    return `telefone/JID: vazio (campos: ${Object.keys(o).slice(0, 50).join(", ") || "—"})`;
  }
  const normalized = normalizeZapiChatKey(phone);
  if (!normalized) {
    const stripped = phone.replace(/@.*/, "");
    return `chave de chat: rejeitada para «${stripped.slice(0, 56)}»`;
  }
  return "inconsistência: número ok mas parse falhou (reporte ao desenvolvimento)";
}

const ZAPI_PHONE_DEBUG_FIELDS = [
  "participantPhone",
  "phone",
  "chatLid",
  "senderLid",
  "participantLid",
  "chatId",
  "connectedPhone",
  "remoteJid",
  "jid",
] as const;

function summarizeScalarForLog(v: unknown): string {
  if (v === undefined) return "(ausente)";
  if (v === null) return "null";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "string") return v.length > 160 ? `${v.slice(0, 160)}…` : v;
  return `[${typeof v}]`;
}

/** Para logs do webhook: valores brutos dos campos de identificação + resultado do picker. */
export function explainZapiPhoneDiagnostics(body: unknown): Record<string, unknown> {
  const o = mergePayloadLayers(body);
  const root = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  if (!o) return { mergeFailed: true };
  const isGroup = o.isGroup === true || o.isGroup === "true";
  const participant =
    typeof o.participantPhone === "string" && o.participantPhone.trim()
      ? o.participantPhone.trim()
      : "";
  const fields: Record<string, unknown> = {};
  for (const k of ZAPI_PHONE_DEBUG_FIELDS) {
    fields[k] = {
      merged: summarizeScalarForLog(o[k]),
      root: root ? summarizeScalarForLog(root[k]) : "(sem raiz)",
    };
  }
  fields._pick_trace = pickPhoneCandidate(o, isGroup, participant, root);
  return fields;
}

/**
 * Garante lead + conversa + mensagem (entrada ou saída); cria oportunidade no primeiro contato.
 * Usa SERVICE_ROLE (admin client).
 */
export async function ingestZapiMessage(parsed: ZapiInbound) {
  const admin = createAdminSupabaseClient();
  const crm = crmTables(admin);

  let phoneE164ForCrm = parsed.phoneE164;
  const originalParsedKey = parsed.phoneE164;
  if (phoneE164ForCrm.startsWith("lid:")) {
    const { data: lidRow, error: lidErr } = await crm
      .from("zapi_lid_map")
      .select("phone_e164")
      .eq("lid_key", phoneE164ForCrm)
      .maybeSingle();
    if (lidErr) {
      console.warn("[zapi ingest] zapi_lid_map (rode a migration 20260422180000):", lidErr.message);
    } else if (lidRow?.phone_e164) {
      const lidKey = phoneE164ForCrm;
      phoneE164ForCrm = lidRow.phone_e164;
      console.info("[zapi ingest] LID → E.164 via mapa", {
        lid: lidKey,
        phone_e164: phoneE164ForCrm,
      });
    }
  }

  /**
   * Auto-merge de conversa quando o histórico antigo ficou em `lid:...` e agora já
   * existe o mapeamento para o E.164 real. Isso evita duas threads para o mesmo contato.
   */
  if (
    originalParsedKey.startsWith("lid:") &&
    !phoneE164ForCrm.startsWith("lid:") &&
    originalParsedKey !== phoneE164ForCrm
  ) {
    const { data: pairRows, error: pairErr } = await crm
      .from("conversations")
      .select("id, lead_id, phone_e164")
      .eq("channel", "whatsapp")
      .in("phone_e164", [originalParsedKey, phoneE164ForCrm]);

    if (pairErr) {
      console.warn("[zapi ingest] merge_lid_conversation lookup:", pairErr.message);
    } else if (pairRows?.length) {
      const lidConv = pairRows.find((r) => r.phone_e164 === originalParsedKey);
      const e164Conv = pairRows.find((r) => r.phone_e164 === phoneE164ForCrm);

      if (lidConv && !e164Conv) {
        const { error: renameErr } = await crm
          .from("conversations")
          .update({ phone_e164: phoneE164ForCrm, updated_at: new Date().toISOString() })
          .eq("id", lidConv.id);
        if (renameErr) {
          console.warn("[zapi ingest] merge_lid_conversation rename:", renameErr.message);
        } else {
          console.info("[zapi ingest] merge_lid_conversation renomeada", {
            from: originalParsedKey,
            to: phoneE164ForCrm,
            conversation_id: lidConv.id,
          });
        }
      } else if (lidConv && e164Conv && lidConv.id !== e164Conv.id) {
        const { error: moveErr } = await crm
          .from("messages")
          .update({ conversation_id: e164Conv.id })
          .eq("conversation_id", lidConv.id);
        if (moveErr) {
          console.warn("[zapi ingest] merge_lid_conversation move_messages:", moveErr.message);
        } else {
          const nowIso = new Date().toISOString();
          await crm
            .from("conversations")
            .update({ updated_at: nowIso })
            .eq("id", e164Conv.id);
          const { error: delErr } = await crm
            .from("conversations")
            .delete()
            .eq("id", lidConv.id);
          if (delErr) {
            console.warn("[zapi ingest] merge_lid_conversation delete_old:", delErr.message);
          } else {
            console.info("[zapi ingest] merge_lid_conversation concluído", {
              lid_conversation_id: lidConv.id,
              e164_conversation_id: e164Conv.id,
              e164: phoneE164ForCrm,
            });
          }
        }
      }
    }
  }

  if (!phoneE164ForCrm.startsWith("lid:") && parsed.linkedLidKeys?.length) {
    const ts = new Date().toISOString();
    for (const lidKey of parsed.linkedLidKeys) {
      if (!lidKey.startsWith("lid:") || lidKey === phoneE164ForCrm) continue;
      const { error: upErr } = await crm.from("zapi_lid_map").upsert(
        { lid_key: lidKey, phone_e164: phoneE164ForCrm, updated_at: ts },
        { onConflict: "lid_key" },
      );
      if (upErr) {
        console.warn("[zapi ingest] zapi_lid_map upsert (payload):", upErr.message);
      }
    }
    console.info("[zapi ingest] zapi_lid_map ligado ao E.164 deste webhook", {
      phone_e164: phoneE164ForCrm,
      lids: parsed.linkedLidKeys,
    });
  }

  const direction = parsed.fromMe ? ("out" as const) : ("in" as const);

  /**
   * Primeira etapa: tenta RPC em `public` (sempre exposta); depois REST em `crm`.
   * Inserts no ingest exigem o schema `crm` em Exposed schemas — a RPC sozinha não basta.
   */
  async function resolveFirstStageId(): Promise<string> {
    const { data: rpcId, error: rpcErr } = await admin.rpc(
      "crm_first_pipeline_stage_id",
    );
    if (rpcErr) {
      console.error("[zapi ingest] crm_first_pipeline_stage_id RPC:", rpcErr.message);
    }
    if (typeof rpcId === "string" && rpcId) return rpcId;

    const { data: stage, error: stageErr } = await crm
      .from("pipeline_stages")
      .select("id")
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (stageErr && stageErr.code !== "PGRST106") {
      console.error("[zapi ingest] pipeline_stages (crm REST):", stageErr.message);
    }
    if (stage?.id) return stage.id;

    throw new Error(
      [
        "Não foi possível obter nenhuma etapa em crm.pipeline_stages via API.",
        "No Supabase: Settings → Data API → Exposed schemas → inclua «crm» (senão PGRST106 em leads/messages).",
        "Confira também se NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são do mesmo projeto onde você vê os dados no SQL Editor.",
        "Se ainda não aplicou: migration 20260418120000_crm_first_pipeline_stage_id_rpc.sql (função em public).",
      ].join(" "),
    );
  }

  const providerId = parsed.messageId ?? undefined;

  if (providerId && parsed.messageStatus === "read") {
    const readAt = parsed.sentAtIso ?? new Date().toISOString();
    const { data: readRows, error: readUpdateError } = await crm
      .from("messages")
      .update({
        message_status: "read",
        read_at: readAt,
      })
      .eq("provider_message_id", providerId)
      .eq("direction", "out")
      .or("message_status.is.null,message_status.neq.read")
      .select("conversation_id");
    if (readUpdateError) {
      console.warn("[zapi ingest] message read status update:", readUpdateError.message);
    } else if ((readRows ?? []).length > 0) {
      const touchedConversationIds = [...new Set((readRows ?? []).map((row) => row.conversation_id))];
      await crm
        .from("conversations")
        .update({ updated_at: readAt })
        .in("id", touchedConversationIds);
      return { ok: true as const, read_status_updated: true as const };
    }
  }

  if (parsed.phoneE164 === "__status_only__") {
    return { ok: true as const, skipped: "status_without_message_match" as const };
  }

  const messageTimeFields =
    parsed.sentAtIso != null ? { sent_at: parsed.sentAtIso } : {};
  const mediaFields = parsed.media
    ? {
        media_kind: parsed.media.kind,
        media_url: parsed.media.url,
        media_mime_type: parsed.media.mimeType,
        media_file_name: parsed.media.fileName,
      }
    : {};

  if (providerId) {
    const { data: existing } = await crm
      .from("messages")
      .select("id, body, conversation_id")
      .eq("provider_message_id", providerId)
      .maybeSingle();
    if (existing) {
      const newBody = typeof parsed.body === "string" ? parsed.body.trim() : "";
      const oldBody = existing.body?.trim() ?? "";
      if (newBody.length > 0 && oldBody.length === 0) {
        await crm
          .from("messages")
          .update({
            body: newBody,
            ...(direction === "out" ? { message_status: "sent" } : {}),
            ...messageTimeFields,
            ...mediaFields,
          })
          .eq("id", existing.id);
        const ts = parsed.sentAtIso ?? new Date().toISOString();
        await crm
          .from("conversations")
          .update({ updated_at: ts })
          .eq("id", existing.conversation_id);
        return { ok: true as const, enriched: true as const };
      }
      return { ok: true as const, idempotent: true };
    }
  }

  let leadId: string | null = null;
  if (parsed.conversationKind === "lead") {
    const firstStageId = await resolveFirstStageId();

    const { data: existingLead } = await crm
      .from("leads")
      .select("id, excluded_from_pipeline_at")
      .eq("phone_e164", phoneE164ForCrm)
      .maybeSingle();

    if (existingLead?.id) {
      leadId = existingLead.id;
      const pipelineExcluded = !!existingLead.excluded_from_pipeline_at;
      if (!pipelineExcluded) {
        const { data: existingOpp } = await crm
          .from("opportunities")
          .select("id")
          .eq("lead_id", leadId)
          .limit(1)
          .maybeSingle();
        if (!existingOpp) {
          await crm.from("opportunities").insert({
            lead_id: leadId,
            stage_id: firstStageId,
            title: `WhatsApp ${phoneE164ForCrm}`,
          });
        }
      }
    } else {
      const { data: insertedLead, error: leadErr } = await crm
        .from("leads")
        .insert({
          phone_e164: phoneE164ForCrm,
          source: "whatsapp",
          status: "open",
        })
        .select("id")
        .single();
      if (leadErr) {
        if (leadErr.code === "23505") {
          const { data: again } = await crm
            .from("leads")
            .select("id, excluded_from_pipeline_at")
            .eq("phone_e164", phoneE164ForCrm)
            .single();
          if (!again?.id) throw leadErr;
          leadId = again.id;
          if (!again.excluded_from_pipeline_at) {
            const { data: oppRace } = await crm
              .from("opportunities")
              .select("id")
              .eq("lead_id", leadId)
              .limit(1)
              .maybeSingle();
            if (!oppRace) {
              await crm.from("opportunities").insert({
                lead_id: leadId,
                stage_id: firstStageId,
                title: `WhatsApp ${phoneE164ForCrm}`,
              });
            }
          }
        } else {
          throw leadErr;
        }
      } else {
        leadId = insertedLead!.id;

        await crm.from("activity_logs").insert({
          entity_type: "lead",
          entity_id: leadId,
          action: "created_from_whatsapp",
          payload: { phone: phoneE164ForCrm },
        });

        await crm.from("opportunities").insert({
          lead_id: leadId,
          stage_id: firstStageId,
          title: `WhatsApp ${phoneE164ForCrm}`,
        });
      }
    }
  }

  if (parsed.conversationKind === "lead" && !phoneE164ForCrm.startsWith("lid:")) {
    const avatarUrl = await fetchZapiProfilePictureLink(phoneE164ForCrm);
    const nowIso = new Date().toISOString();
    const { data: contactRow, error: contactErr } = await crm
      .from("contacts")
      .upsert(
        {
          phone_e164: phoneE164ForCrm,
          ...(parsed.contactName ? { full_name: parsed.contactName } : {}),
          ...(avatarUrl ? { avatar_url: avatarUrl, avatar_updated_at: nowIso } : {}),
          updated_at: nowIso,
        },
        { onConflict: "phone_e164" },
      )
      .select("id")
      .single();

    if (contactErr) {
      console.warn("[zapi ingest] contacts upsert (name):", contactErr.message);
    } else if (contactRow?.id && leadId) {
      const { error: leadContactErr } = await crm
        .from("leads")
        .update({ contact_id: contactRow.id, updated_at: new Date().toISOString() })
        .eq("id", leadId);
      if (leadContactErr) {
        console.warn("[zapi ingest] leads.contact_id update:", leadContactErr.message);
      }
    }
  }

  const { data: conv } = await crm
    .from("conversations")
    .select("id, conversation_kind, group_display_name")
    .eq("channel", "whatsapp")
    .eq("phone_e164", phoneE164ForCrm)
    .maybeSingle();

  let resolvedGroupDisplayName = parsed.groupDisplayName?.trim() || null;
  const isRealGroupJid =
    parsed.conversationKind === "group" && phoneE164ForCrm.toLowerCase().includes("@g.us");
  if (isRealGroupJid && !resolvedGroupDisplayName && !(conv?.group_display_name ?? "").trim()) {
    resolvedGroupDisplayName =
      (await fetchZapiGroupSubjectByJid(phoneE164ForCrm))?.trim() || null;
  }

  let conversationId: string;
  if (conv?.id) {
    conversationId = conv.id;
    if (
      conv.conversation_kind !== parsed.conversationKind ||
      (parsed.conversationKind === "group" && resolvedGroupDisplayName)
    ) {
      await crm
        .from("conversations")
        .update({
          conversation_kind: parsed.conversationKind,
          lead_id: parsed.conversationKind === "lead" ? leadId : null,
          ...(parsed.conversationKind === "group" && resolvedGroupDisplayName
            ? { group_display_name: resolvedGroupDisplayName }
            : {}),
          updated_at: parsed.sentAtIso ?? new Date().toISOString(),
        })
        .eq("id", conv.id);
    }
  } else {
    const { data: ins, error: cErr } = await crm
      .from("conversations")
      .insert({
        lead_id: leadId,
        channel: "whatsapp",
        phone_e164: phoneE164ForCrm,
        conversation_kind: parsed.conversationKind,
        ...(parsed.conversationKind === "group" && resolvedGroupDisplayName
          ? { group_display_name: resolvedGroupDisplayName }
          : {}),
      })
      .select("id")
      .single();
    if (cErr || !ins) throw cErr ?? new Error("conversation insert");
    conversationId = ins.id;
  }

  async function touchConversationTimestamp() {
    const ts = parsed.sentAtIso ?? new Date().toISOString();
    await crm
      .from("conversations")
      .update({ updated_at: ts })
      .eq("id", conversationId);
  }

  /**
   * CRM envia com texto; o webhook de entrega (DeliveryCallback) muitas vezes vem **sem** texto.
   * Com texto no payload: casa pelo body; sem texto: vincula ao envio órfão mais antigo (FIFO) na janela.
   */
  if (direction === "out" && providerId) {
    const since = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    const bodyTrim =
      typeof parsed.body === "string" && parsed.body.trim().length > 0
        ? parsed.body.trim()
        : null;

    let pending: { id: string; provider_message_id: string | null } | null =
      null;

    if (bodyTrim !== null) {
      const { data } = await crm
        .from("messages")
        .select("id, provider_message_id")
        .eq("conversation_id", conversationId)
        .eq("direction", "out")
        .eq("body", bodyTrim)
        .is("provider_message_id", null)
        .gte("sent_at", since)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      pending = data;
    } else {
      const { data } = await crm
        .from("messages")
        .select("id, provider_message_id")
        .eq("conversation_id", conversationId)
        .eq("direction", "out")
        .is("provider_message_id", null)
        .gte("sent_at", since)
        .order("sent_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      pending = data;
    }

    if (pending?.id && !pending.provider_message_id) {
      const { error: uErr } = await crm
        .from("messages")
        .update({
          provider_message_id: providerId,
          message_status: "sent",
          ...messageTimeFields,
        })
        .eq("id", pending.id);
      if (!uErr) {
        await touchConversationTimestamp();
        return {
          ok: true as const,
          leadId,
          conversationId,
          linked_pending_out: true as const,
        };
      }
    }
  }

  const evSkip = parsed.eventType?.toLowerCase() ?? "";
  if (
    evSkip === "deliverycallback" &&
    (!parsed.body || !String(parsed.body).trim())
  ) {
    return { ok: true as const, skipped: "delivery_without_text" as const };
  }

  const { error: mErr } = await crm.from("messages").insert({
    conversation_id: conversationId,
    direction,
    body:
      parsed.body && String(parsed.body).trim()
        ? String(parsed.body).trim()
        : "[Sem prévia — tipo de mensagem não mapeado]",
    provider_message_id: providerId ?? null,
    ...(direction === "out" ? { message_status: "sent" } : {}),
    ...mediaFields,
    ...messageTimeFields,
  });
  if (mErr) {
    if (mErr.code === "23505") {
      return { ok: true as const, idempotent: true };
    }
    throw mErr;
  }

  await touchConversationTimestamp();
  return { ok: true as const, leadId, conversationId };
}

/** @deprecated Use ingestZapiMessage — mantido para compat. */
export const ingestInboundMessage = ingestZapiMessage;
