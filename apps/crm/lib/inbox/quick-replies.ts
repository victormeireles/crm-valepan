export type QuickReply = { id?: string; title: string; body: string };

export type MessageTemplateDTO = {
  id: string;
  title: string;
  body: string;
  sort_order: number;
  active: boolean;
};

export const MESSAGE_TEMPLATE_TITLE_MAX = 80;
export const MESSAGE_TEMPLATE_BODY_MAX = 2000;

export function normalizeMessageTemplateTitle(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeMessageTemplateBody(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

/** Primeiro token do nome completo; vazio se não houver nome. */
export function templateFirstName(fullName: string | null | undefined) {
  return (fullName ?? "").trim().split(/\s+/)[0] || "";
}

export function renderQuickReply(
  body: string,
  vars: { firstName: string; comercialNome?: string },
) {
  return body
    .replaceAll("{{primeiro_nome}}", vars.firstName.trim() || "tudo bem")
    .replaceAll("{{comercial_nome}}", vars.comercialNome?.trim() || "equipe");
}
