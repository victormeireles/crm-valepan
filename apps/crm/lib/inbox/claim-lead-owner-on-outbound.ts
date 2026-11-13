/**
 * Soft-claim do responsável na primeira mensagem humana outbound.
 * Só preenche owner_id quando ainda está null (lead e oportunidades).
 * Não move etapa do funil.
 */

type SoftClaimUpdateBuilder = {
  update: (values: { owner_id: string; updated_at: string }) => {
    eq: (column: string, value: string) => {
      is: (column: string, value: null) => PromiseLike<{ error: { message: string } | null }>;
    };
  };
};

export type ClaimLeadOwnerCrm = {
  from: (table: "leads" | "opportunities") => SoftClaimUpdateBuilder;
};

export async function claimLeadOwnerOnOutbound(
  crm: ClaimLeadOwnerCrm,
  input: { leadId: string; userId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const leadId = input.leadId.trim();
  const userId = input.userId.trim();
  if (!leadId || !userId) {
    return { ok: false, error: "Dados incompletos para atribuir responsável." };
  }

  const nowIso = new Date().toISOString();
  const payload = { owner_id: userId, updated_at: nowIso };

  const { error: leadError } = await crm
    .from("leads")
    .update(payload)
    .eq("id", leadId)
    .is("owner_id", null);
  if (leadError) return { ok: false, error: leadError.message };

  const { error: opportunityError } = await crm
    .from("opportunities")
    .update(payload)
    .eq("lead_id", leadId)
    .is("owner_id", null);
  if (opportunityError) return { ok: false, error: opportunityError.message };

  return { ok: true };
}
