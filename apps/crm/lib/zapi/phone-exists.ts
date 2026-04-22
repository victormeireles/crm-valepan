import { normalizeBrazilPhoneToE164 } from "@crm/shared/phone";
import { crmTables, createAdminSupabaseClient } from "@/lib/supabase/admin";

type PhoneExistsRow = {
  exists?: boolean | string;
  phone?: string;
  lid?: string | null;
};

function parsePhoneExistsBody(raw: unknown): PhoneExistsRow | null {
  if (raw === null || raw === undefined) return null;
  if (Array.isArray(raw)) {
    const first = raw[0];
    if (first && typeof first === "object") return first as PhoneExistsRow;
    return null;
  }
  if (typeof raw === "object") return raw as PhoneExistsRow;
  return null;
}

function rowExistsTrue(row: PhoneExistsRow): boolean {
  const e = row.exists;
  return e === true || e === "true";
}

/** Normaliza `lid:123` a partir da string `123@lid` da Z-API. */
export function lidKeyFromZapiLidString(lid: string): string | null {
  const t = lid.trim();
  if (!t.toLowerCase().includes("@lid")) return null;
  const digits = (t.split("@")[0] ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `lid:${digits}`;
}

/**
 * GET …/phone-exists/{ddiDddNumero} — documentação Z-API.
 * Retorna o `lid` associado ao número (quando exists), para gravar em crm.zapi_lid_map.
 */
export async function fetchZapiPhoneExistsRow(
  phoneDigits: string,
): Promise<{ exists: boolean; phoneFormatted: string | null; lidKey: string | null }> {
  const base = process.env.ZAPI_BASE_URL ?? "https://api.z-api.io";
  const inst = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;
  if (!inst || !token) {
    return { exists: false, phoneFormatted: null, lidKey: null };
  }

  const digits = phoneDigits.replace(/\D/g, "");
  if (digits.length < 8) {
    return { exists: false, phoneFormatted: null, lidKey: null };
  }

  const url = `${base.replace(/\/$/, "")}/instances/${inst}/token/${token}/phone-exists/${digits}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      ...(clientToken ? { "Client-Token": clientToken } : {}),
    },
  });

  if (!res.ok) {
    console.warn("[zapi phone-exists] HTTP", res.status, await res.text().catch(() => ""));
    return { exists: false, phoneFormatted: null, lidKey: null };
  }

  const raw: unknown = await res.json().catch(() => null);
  const row = parsePhoneExistsBody(raw);
  if (!row || !rowExistsTrue(row)) {
    return { exists: false, phoneFormatted: null, lidKey: null };
  }

  const phoneFormatted =
    typeof row.phone === "string" && row.phone.trim() ? row.phone.trim() : null;
  const lidKey =
    typeof row.lid === "string" && row.lid.trim() ? lidKeyFromZapiLidString(row.lid.trim()) : null;

  return { exists: true, phoneFormatted, lidKey };
}

function digitsLooseE164(d: string): string | null {
  const x = d.replace(/\D/g, "");
  if (x.length < 8 || x.length > 15) return null;
  if (!/^[1-9]\d+$/.test(x)) return null;
  return `+${x}`;
}

/** E.164 para o CRM a partir do retorno phone-exists (ex.: 5544999999999). */
export function e164FromPhoneExistsPhoneField(phoneField: string | null, fallbackDigits: string): string | null {
  if (phoneField) {
    const br = normalizeBrazilPhoneToE164(phoneField.replace(/@.*/, ""));
    if (br) return br;
  }
  return normalizeBrazilPhoneToE164(fallbackDigits) ?? digitsLooseE164(fallbackDigits);
}

/**
 * Chama a Z-API e grava lid_key → phone_e164 (service role).
 * Use após enviar mensagem para um número real pelo CRM.
 */
export async function registerZapiLidMapForPhoneDigits(phoneDigits: string): Promise<void> {
  const t = phoneDigits.trim();
  if (t.startsWith("lid:") || t.toLowerCase().includes("@lid")) return;

  const digits = phoneDigits.replace(/\D/g, "");
  if (digits.length < 8) return;

  const { exists, phoneFormatted, lidKey } = await fetchZapiPhoneExistsRow(digits);
  if (!exists || !lidKey) return;

  const phoneE164 = e164FromPhoneExistsPhoneField(phoneFormatted, digits);
  if (!phoneE164) return;

  const admin = createAdminSupabaseClient();
  const crm = crmTables(admin);
  const { error } = await crm.from("zapi_lid_map").upsert(
    { lid_key: lidKey, phone_e164: phoneE164, updated_at: new Date().toISOString() },
    { onConflict: "lid_key" },
  );
  if (error) {
    console.warn("[zapi lid_map] upsert falhou:", error.message);
    return;
  }
  console.info("[zapi lid_map] registrado", { lid_key: lidKey, phone_e164: phoneE164 });
}
