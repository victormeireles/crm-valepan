import { displayCompanyName, displayPersonName } from "@/lib/lead-identity";
import {
  cardMatchesPipelineFilters,
  computePipelineSignals,
  isPipelineSignal,
  type PipelineSignal,
} from "@/lib/pipeline-signals";
import { nestOne } from "@/lib/supabase/nested";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { Suspense } from "react";
import { PipelineBoard, type PipelineCardDTO, type PipelineStageDTO } from "./pipeline-board";
import { PipelineFilters } from "./pipeline-filters";

export const dynamic = "force-dynamic";

type LeadN = {
  phone_e164: string;
  owner_id?: string | null;
  client_category?: string | null;
  contacts?: { full_name: string | null } | { full_name: string | null }[] | null;
  companies?: { name: string | null } | { name: string | null }[] | null;
  distributors?: { name: string | null } | { name: string | null }[] | null;
};

const TEAM_ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  comercial: "Comercial",
  gestao: "Gestão",
  operacao: "Operação",
};

function formatTeamOption(p: { id: string; full_name: string | null; role: string }) {
  const name = (p.full_name ?? "").trim() || "Sem nome";
  const role = TEAM_ROLE_LABEL[p.role] ?? p.role;
  return { id: p.id, label: `${name} (${role})` };
};

function mapRowToCard(
  o: {
    id: string;
    title: string | null;
    lead_id: string | null;
    stage_id: string;
    lost_reason: string | null;
    owner_id: string | null;
    updated_at: string;
    next_action_at: string | null;
    pipeline_stages: { name: string; is_final: boolean } | { name: string; is_final: boolean }[] | null;
    leads: LeadN | LeadN[] | null;
  },
  lastDirectionByLead: Map<string, string>,
): PipelineCardDTO {
  const lead = nestOne(o.leads);
  const stage = nestOne(o.pipeline_stages);
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

  const leadId = o.lead_id;
  const lastDirection = leadId ? (lastDirectionByLead.get(leadId) ?? null) : null;
  const isFinal = stage?.is_final ?? false;

  return {
    id: o.id,
    stage_id: o.stage_id,
    title: o.title,
    lost_reason: o.lost_reason,
    lead_id: leadId,
    personName,
    companyLine,
    client_category: lead?.client_category ?? null,
    phone_e164: lead?.phone_e164 ?? null,
    ownerId: o.owner_id ?? lead?.owner_id ?? null,
    signals: computePipelineSignals({
      oppUpdatedAt: o.updated_at,
      nextActionAt: o.next_action_at,
      isFinalStage: isFinal,
      lastMessageDirection: lastDirection,
    }),
  };
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const mineOnly = sp.mine === "1";
  const ownerParam = typeof sp.owner === "string" ? sp.owner.trim() : "";
  const signalRaw = typeof sp.signal === "string" ? sp.signal.trim() : "";
  const signalFilter: PipelineSignal | null = isPipelineSignal(signalRaw) ? signalRaw : null;
  const query = typeof sp.q === "string" ? sp.q : "";

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const crm = crmTables(supabase);

  const ownerUserId = mineOnly && user?.id ? user.id : ownerParam.length > 0 ? ownerParam : null;

  const [{ data: stageRows }, { data: rows }, { data: teamProfiles }] = await Promise.all([
    crm
      .from("pipeline_stages")
      .select("id, name, sort_order, is_final")
      .order("sort_order", { ascending: true }),
    crm
      .from("opportunities")
      .select(
        "id, title, lead_id, stage_id, lost_reason, owner_id, updated_at, next_action_at, pipeline_stages(name, sort_order, is_final), leads(phone_e164, owner_id, client_category, contacts(full_name), companies(name), distributors(name))",
      )
      .order("updated_at", { ascending: false }),
    crm.from("profiles").select("id, full_name, role").order("full_name", { ascending: true }),
  ]);

  const leadIds = [...new Set((rows ?? []).map((r) => r.lead_id).filter((id): id is string => !!id))];

  const { data: lastMessages } =
    leadIds.length > 0
      ? await crm
          .from("v_lead_last_message")
          .select("lead_id, last_direction")
          .in("lead_id", leadIds)
      : { data: [] as { lead_id: string; last_direction: string }[] };

  const lastDirectionByLead = new Map<string, string>();
  for (const row of lastMessages ?? []) {
    lastDirectionByLead.set(row.lead_id, row.last_direction);
  }

  const stages: PipelineStageDTO[] = (stageRows ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    sort_order: s.sort_order,
    is_final: s.is_final,
  }));

  const allCards: PipelineCardDTO[] = (rows ?? []).map((o) =>
    mapRowToCard(
      o as unknown as Parameters<typeof mapRowToCard>[0],
      lastDirectionByLead,
    ),
  );

  const filteredCards = allCards.filter((card) =>
    cardMatchesPipelineFilters(card, {
      ownerUserId,
      signal: signalFilter,
      query,
    }),
  );

  const teamOptions = (teamProfiles ?? []).map(formatTeamOption);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold">Funil</h1>
      </div>

      <Suspense fallback={<p className="text-sm text-[var(--muted)]">Carregando filtros…</p>}>
        <PipelineFilters
          totalCount={allCards.length}
          visibleCount={filteredCards.length}
          teamOptions={teamOptions}
        />
      </Suspense>

      {stages.length > 0 ? (
        <div className="w-full min-w-0 overflow-x-auto pb-1 [scrollbar-gutter:stable]">
          <div
            className="grid gap-1 sm:gap-1.5"
            style={{
              gridTemplateColumns: `repeat(${stages.length}, minmax(52px, 1fr))`,
              width: `max(100%, ${stages.length * 52}px)`,
            }}
          >
            {stages.map((s) => {
              const count = filteredCards.filter((c) => c.stage_id === s.id).length;
              return (
                <span
                  key={s.id}
                  title={`${s.name}: ${count}`}
                  className="truncate rounded-md border border-[var(--border)] bg-[var(--card)] px-1 py-1.5 text-center text-[10px] leading-tight text-[var(--muted)] sm:text-[11px]"
                >
                  <span className="block truncate font-medium text-[var(--foreground)]">{s.name}</span>
                  <strong className="tabular-nums text-[var(--foreground)]">{count}</strong>
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      {stages.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Nenhuma etapa do funil configurada.</p>
      ) : (
        <PipelineBoard stages={stages} initialCards={filteredCards} />
      )}
    </div>
  );
}
