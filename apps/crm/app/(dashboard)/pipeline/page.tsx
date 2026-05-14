import { displayCompanyName, displayPersonName } from "@/lib/lead-identity";
import { nestOne } from "@/lib/supabase/nested";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { PipelineBoard, type PipelineCardDTO, type PipelineStageDTO } from "./pipeline-board";

type LeadN = {
  phone_e164: string;
  client_category?: string | null;
  contacts?: { full_name: string | null } | { full_name: string | null }[] | null;
  companies?: { name: string | null } | { name: string | null }[] | null;
  distributors?: { name: string | null } | { name: string | null }[] | null;
};

function mapRowToCard(o: {
  id: string;
  title: string | null;
  lead_id: string | null;
  stage_id: string;
  lost_reason: string | null;
  leads: LeadN | LeadN[] | null;
}): PipelineCardDTO {
  const lead = nestOne(o.leads);
  const contact = nestOne(
    (lead?.contacts ?? null) as
      | { full_name: string | null }
      | { full_name: string | null }[]
      | null,
  );
  const company = nestOne(
    (lead?.companies ?? null) as { name: string | null } | { name: string | null }[] | null,
  );
  const distributor = nestOne(
    (lead?.distributors ?? null) as { name: string | null } | { name: string | null }[] | null,
  );
  const titleFallback = (o.title ?? "").trim();
  const personName = lead
    ? displayPersonName(contact?.full_name)
    : titleFallback.length > 0
      ? titleFallback
      : "Oportunidade";
  const companyLine = lead
    ? displayCompanyName({
        companyName: company?.name,
        distributorName: distributor?.name,
        clientCategory: lead?.client_category,
      })
    : null;

  return {
    id: o.id,
    stage_id: o.stage_id,
    title: o.title,
    lost_reason: o.lost_reason,
    lead_id: o.lead_id,
    personName,
    companyLine,
    client_category: lead?.client_category ?? null,
    phone_e164: lead?.phone_e164 ?? null,
  };
}

export default async function PipelinePage() {
  const supabase = await createServerSupabaseClient();
  const crm = crmTables(supabase);

  const [{ data: stageRows }, { data: rows }] = await Promise.all([
    crm
      .from("pipeline_stages")
      .select("id, name, sort_order, is_final")
      .order("sort_order", { ascending: true }),
    crm
      .from("opportunities")
      .select(
        "id, title, lead_id, stage_id, lost_reason, pipeline_stages(name, sort_order), leads(phone_e164, client_category, contacts(full_name), companies(name), distributors(name))",
      )
      .order("updated_at", { ascending: false }),
  ]);

  const stages: PipelineStageDTO[] = (stageRows ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    sort_order: s.sort_order,
    is_final: s.is_final,
  }));

  const initialCards: PipelineCardDTO[] = (rows ?? []).map((o) =>
    mapRowToCard(
      o as unknown as {
        id: string;
        title: string | null;
        lead_id: string | null;
        stage_id: string;
        lost_reason: string | null;
        leads: LeadN | LeadN[] | null;
      },
    ),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold">Funil</h1>
        <p className="text-sm text-[var(--muted)]">
          {rows?.length ?? 0} oportunidade{(rows?.length ?? 0) === 1 ? "" : "s"}
        </p>
      </div>
      {stages.length > 0 ? (
        <div className="flex flex-wrap gap-2 text-xs">
          {stages.map((s) => {
            const count = initialCards.filter((c) => c.stage_id === s.id).length;
            return (
              <span
                key={s.id}
                className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-[var(--muted)]"
              >
                {s.name}: <strong className="text-[var(--foreground)]">{count}</strong>
              </span>
            );
          })}
        </div>
      ) : null}

      {stages.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Nenhuma etapa do funil configurada.</p>
      ) : (
        <PipelineBoard stages={stages} initialCards={initialCards} />
      )}
    </div>
  );
}
