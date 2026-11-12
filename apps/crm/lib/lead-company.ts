import type { crmTables } from "@/lib/supabase/server";

/** Nome máximo de `crm.companies.name` aceito pelo CRM. */
export const COMPANY_NAME_MAX_LEN = 80;

/**
 * Garante `crm.companies.name` (e `leads.company_id`) para leads classificados como distribuidor,
 * mesmo sem CNPJ/cidade. Usa o nome informado, senão o nome do contato, senão o telefone.
 */
export async function ensureLeadCompanyName(
  crm: ReturnType<typeof crmTables>,
  leadId: string,
  opts: { name?: string | null; phoneE164Fallback?: string | null },
): Promise<{ ok: true; companyId: string } | { ok: false; error: string }> {
  const { data: lead, error: leadErr } = await crm
    .from("leads")
    .select("id, company_id, contact_id, phone_e164")
    .eq("id", leadId)
    .maybeSingle();
  if (leadErr) return { ok: false, error: leadErr.message };
  if (!lead?.id) return { ok: false, error: "Lead não encontrado." };

  const requested = (opts.name ?? "").trim();

  let currentName = "";
  if (lead.company_id) {
    const { data: company, error: companyErr } = await crm
      .from("companies")
      .select("name")
      .eq("id", lead.company_id)
      .maybeSingle();
    if (companyErr) return { ok: false, error: companyErr.message };
    currentName = (company?.name ?? "").trim();
    if (!requested && currentName) return { ok: true, companyId: lead.company_id };
  }

  let name = requested;
  if (!name && lead.contact_id) {
    const { data: contact } = await crm
      .from("contacts")
      .select("full_name")
      .eq("id", lead.contact_id)
      .maybeSingle();
    name = (contact?.full_name ?? "").trim();
  }
  if (!name) {
    const phone =
      (opts.phoneE164Fallback ?? "").trim() || (lead.phone_e164 ?? "").trim() || "sem telefone";
    name = `Empresa ${phone}`;
  }
  if (name.length > COMPANY_NAME_MAX_LEN) name = name.slice(0, COMPANY_NAME_MAX_LEN);

  const now = new Date().toISOString();
  if (lead.company_id) {
    if (name === currentName) return { ok: true, companyId: lead.company_id };
    const { error: updCompanyErr } = await crm
      .from("companies")
      .update({ name, updated_at: now })
      .eq("id", lead.company_id);
    if (updCompanyErr) return { ok: false, error: updCompanyErr.message };
    return { ok: true, companyId: lead.company_id };
  }

  const { data: insertedCompany, error: insCompanyErr } = await crm
    .from("companies")
    .insert({ name })
    .select("id")
    .single();
  if (insCompanyErr || !insertedCompany) {
    return { ok: false, error: insCompanyErr?.message ?? "Erro ao criar empresa." };
  }

  const { error: updLeadErr } = await crm
    .from("leads")
    .update({ company_id: insertedCompany.id, updated_at: now })
    .eq("id", leadId);
  if (updLeadErr) return { ok: false, error: updLeadErr.message };

  return { ok: true, companyId: insertedCompany.id };
}

