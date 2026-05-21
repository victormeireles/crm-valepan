export const LEAD_EXCLUSION_REASONS = ["interno", "fornecedor", "outro"] as const;

export type LeadExclusionReason = (typeof LEAD_EXCLUSION_REASONS)[number];

export const LEAD_EXCLUSION_REASON_LABELS: Record<LeadExclusionReason, string> = {
  interno: "Contato interno",
  fornecedor: "Fornecedor / parceiro",
  outro: "Outro",
};

export function isLeadExclusionReason(v: string): v is LeadExclusionReason {
  return (LEAD_EXCLUSION_REASONS as readonly string[]).includes(v);
}

export function isLeadExcludedFromPipeline(
  lead: { excluded_from_pipeline_at?: string | null } | null | undefined,
): boolean {
  return !!(lead?.excluded_from_pipeline_at ?? "").trim();
}

export function leadExclusionReasonLabel(reason: string | null | undefined): string {
  if (reason && isLeadExclusionReason(reason)) return LEAD_EXCLUSION_REASON_LABELS[reason];
  return "Não prospecto";
}
