/** Opções fixas para `crm.sample_shipments.send_via` (MAIÚSCULAS, ordem alfabética A–Z). */
export const SEND_VIA_OPTIONS = [
  "CACHINHOS",
  "DELOVA",
  "KOUTO",
  "LOUCOS",
  "MR",
  "NEW SPACE",
  "NOE",
  "TOP ALTO",
] as const;

export type SendViaOption = (typeof SEND_VIA_OPTIONS)[number];

export function isSendViaOption(v: string): v is SendViaOption {
  return (SEND_VIA_OPTIONS as readonly string[]).includes(v);
}
