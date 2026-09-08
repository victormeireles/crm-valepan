import { z } from "zod";
import { normalizeBrazilPhoneToE164 } from "@crm/shared/phone";
import { isValidCpfCnpj, normalizeCpfCnpj } from "@/lib/cpf-cnpj";

export const IFOOD_CAMPAIGN = {
  source: "ifood_event",
  label: "Evento iFood",
  path: "/cadastro/ifood",
  endpoint: "/api/cadastro/ifood",
} as const;

export const CAPTURE_CONTACT_NOTICE =
  "Ao enviar, você autoriza a Valepan a entrar em contato sobre seus produtos usando os dados informados.";
export const CAPTURE_NOTICE_VERSION = "2026-09-07";

const BRAZIL_DDDS = new Set(
  "11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99".split(" "),
);

export function validCapturePhone(value: string): boolean {
  const phone = normalizeBrazilPhoneToE164(value);
  if (!phone) return false;
  const national = phone.slice(3);
  return BRAZIL_DDDS.has(national.slice(0, 2)) &&
    /^(?:\d{2}[2-5]\d{7}|\d{2}9\d{8})$/.test(national) &&
    !/^(\d)\1+$/.test(national.slice(2));
}

export const leadCaptureSchema = z.object({
  name: z.string().max(120, "Use até 120 caracteres.").transform((v) => v.trim().replace(/\s+/g, " "))
    .refine((v) => v.length >= 2 && /\p{L}.*\p{L}/u.test(v), "Informe seu nome.")
    .refine((v) => !/[<>\u0000-\u001f]/.test(v), "Confira o nome informado."),
  phone: z.string().max(30).refine(validCapturePhone, "Informe um telefone válido com DDD.")
    .transform((v) => normalizeBrazilPhoneToE164(v)!),
  clientType: z.enum(["hamburgueria", "distribuidor"], {
    errorMap: () => ({ message: "Selecione o tipo de cliente." }),
  }),
  zipCode: z.string().max(10).transform((v) => v.replace(/\D/g, ""))
    .refine((v) => /^\d{8}$/.test(v) && !/^(\d)\1{7}$/.test(v), "Informe um CEP válido com 8 números."),
  document: z.string().max(25, "Confira o CPF ou CNPJ informado.").transform(normalizeCpfCnpj)
    .refine((v) => v === "" || isValidCpfCnpj(v), "Informe um CPF ou CNPJ válido.").optional(),
  website: z.string().max(200).optional(),
}).strict();

export type LeadCaptureInput = z.input<typeof leadCaptureSchema>;
export type CaptureFieldErrors = Partial<Record<keyof LeadCaptureInput, string>>;

export function formatCapturePhone(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) digits = digits.slice(2);
  digits = digits.slice(0, 11);
  if (digits.length <= 2) return digits;
  const split = digits.length > 10 ? 7 : 6;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, split)}${digits.length > split ? `-${digits.slice(split)}` : ""}`;
}

export function formatCaptureZip(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

export function formatLeadSource(source: string): string {
  const key = source.trim().toLowerCase();
  return ({ whatsapp: "WhatsApp", manual: "Manual", [IFOOD_CAMPAIGN.source]: IFOOD_CAMPAIGN.label })[key] ?? source;
}
