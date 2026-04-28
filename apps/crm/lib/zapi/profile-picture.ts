/**
 * Busca a foto de perfil atual do contato no WhatsApp via Z-API.
 * Documentação: contacts/get-profile-picture (retorna { link }).
 */
export async function fetchZapiProfilePictureLink(
  phoneDigitsOrE164: string,
): Promise<string | null> {
  const base = process.env.ZAPI_BASE_URL ?? "https://api.z-api.io";
  const inst = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;
  if (!inst || !token) return null;

  const digits = phoneDigitsOrE164.replace(/\D/g, "");
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
      const raw: unknown = await res.json().catch(() => null);
      const link =
        raw && typeof raw === "object" && "link" in raw
          ? (raw as { link?: unknown }).link
          : null;
      if (typeof link === "string" && link.trim()) {
        return link.trim();
      }
    } catch {
      // tenta a próxima variação de endpoint
    }
  }

  return null;
}
