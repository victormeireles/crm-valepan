import { displayCompanyName, displayPersonName } from "@/lib/lead-identity";
import { isLeadExcludedFromPipeline } from "@/lib/lead-pipeline-exclusion";
import {
  cardMatchesPipelineFilters,
  computePipelineSignals,
  isPipelineSignal,
  isPipelineRegion,
  type PipelineSignal,
} from "@/lib/pipeline-signals";
import { isClientCategoryValue, type ClientCategoryValue } from "@/lib/client-categories";
import { INBOX_MESSAGES_VISIBLE_SINCE } from "@/lib/inbox/load-messages";
import { isMissingNetworkTypeColumnError } from "@/lib/leads/list-query";
import { nestOne } from "@/lib/supabase/nested";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { Suspense } from "react";
import { PipelineBoard, type PipelineCardDTO, type PipelineStageDTO } from "./pipeline-board";
import { PipelineOwnerSummary } from "./pipeline-owner-summary";

const OPPORTUNITY_BATCH_SIZE = 500;
const LAST_MESSAGE_LEAD_BATCH_SIZE = 100;
const OPPORTUNITY_SELECT_BASE =
  "id, title, lead_id, stage_id, lost_reason, owner_id, updated_at, next_action_at, pipeline_stages(name, sort_order, is_final), leads!inner(phone_e164, owner_id, client_category, distributor_id, excluded_from_pipeline_at, contacts(full_name), companies(name), distributors(name))";
const OPPORTUNITY_SELECT_WITH_NETWORK = OPPORTUNITY_SELECT_BASE.replace(
  "distributor_id, excluded_from_pipeline_at",
  "distributor_id, network_type, excluded_from_pipeline_at",
);
import { PipelineFilters } from "./pipeline-filters";

export const dynamic = "force-dynamic";

type LeadN = {
  phone_e164: string;
  owner_id?: string | null;
  excluded_from_pipeline_at?: string | null;
  client_category?: string | null;
  distributor_id?: string | null;
  network_type?: string | null;
  contacts?: { full_name: string | null } | { full_name: string | null }[] | null;
  companies?: { name: string | null } | { name: string | null }[] | null;
  distributors?: { name: string | null } | { name: string | null }[] | null;
};

function formatTeamOption(p: { id: string; full_name: string | null; role: string }) {
  const name = (p.full_name ?? "").trim() || "Sem nome";
  return { id: p.id, label: name };
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
    distributor_id: lead?.distributor_id ?? null,
    network_type: lead?.network_type ?? null,
    phone_e164: lead?.phone_e164 ?? null,
    ownerId: o.owner_id ?? lead?.owner_id ?? null,
    ownerName: null,
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
  const regionRaw = typeof sp.region === "string" ? sp.region.trim() : "";
  const regionFilter = isPipelineRegion(regionRaw) ? regionRaw : null;
  const categoryRaw = typeof sp.client_category === "string" ? sp.client_category.trim() : "";
  const categoryFilter: ClientCategoryValue | null = isClientCategoryValue(categoryRaw)
    ? categoryRaw
    : null;
  const query = typeof sp.q === "string" ? sp.q : "";
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const crm = crmTables(supabase);
  const { data: currentProfile } = user?.id
    ? await crm.from("profiles").select("role").eq("id", user.id).maybeSingle()
    : { data: null };
  const canViewTeam = currentProfile?.role === "admin" || currentProfile?.role === "gestao";
  const ownerUserId = canViewTeam
    ? mineOnly && user?.id
      ? user.id
      : ownerParam.length > 0
        ? ownerParam
        : null
    : null;
  const [
    { data: stageRows },
    { data: teamProfiles },
  ] = await Promise.all([
    crm
      .from("pipeline_stages")
      .select("id, name, sort_order, is_final")
      .order("sort_order", { ascending: true }),
    crm.from("profiles").select("id, full_name, role").order("full_name", { ascending: true }),
  ]);

  // O funil precisa distribuir oportunidades entre colunas antes de exibi-las.
  // Paginar globalmente aqui fazia as etapas mais recentes consumirem todo o
  // lote e escondia etapas existentes (por exemplo, NEGOCIAÇÃO aparecia com 0).
  const rows: Array<Parameters<typeof mapRowToCard>[0]> = [];
  let networkTypeAvailable = true;
  for (let offset = 0; ; offset += OPPORTUNITY_BATCH_SIZE) {
    const buildOpportunitiesQuery = (select: string) => {
      const base = crm
      .from("opportunities")
      .select(select)
      .is("leads.excluded_from_pipeline_at", null)
      .order("updated_at", { ascending: false });
      return base;
    };
    let result = await buildOpportunitiesQuery(
      networkTypeAvailable ? OPPORTUNITY_SELECT_WITH_NETWORK : OPPORTUNITY_SELECT_BASE,
    ).range(
      offset,
      offset + OPPORTUNITY_BATCH_SIZE - 1,
    );
    if (result.error && networkTypeAvailable && isMissingNetworkTypeColumnError(result.error)) {
      networkTypeAvailable = false;
      result = await buildOpportunitiesQuery(OPPORTUNITY_SELECT_BASE).range(
        offset,
        offset + OPPORTUNITY_BATCH_SIZE - 1,
      );
    }
    if (result.error) throw result.error;
    const batch = (result.data ?? []).map((row) => {
      if (networkTypeAvailable) return row;
      const rowObject = row as unknown as Record<string, unknown>;
      const lead = nestOne((rowObject.leads as LeadN | LeadN[] | null | undefined) ?? null);
      return lead ? { ...rowObject, leads: { ...lead, network_type: null } } : row;
    }) as unknown as Array<Parameters<typeof mapRowToCard>[0]>;
    rows.push(...batch);
    if (batch.length < OPPORTUNITY_BATCH_SIZE) break;
  }

  const leadIds = [...new Set((rows ?? []).map((r) => r.lead_id).filter((id): id is string => !!id))];

  // Uma única cláusula `in` com todos os leads do funil pode ultrapassar o
  // limite de tamanho da URL do PostgREST. Quando isso acontecia, o erro era
  // ignorado e todos os cartões eram eliminados como se não houvesse mensagens.
  const lastMessageBatches = await Promise.all(
    Array.from({ length: Math.ceil(leadIds.length / LAST_MESSAGE_LEAD_BATCH_SIZE) }, (_, index) =>
      crm
        .from("v_lead_last_message")
        .select("lead_id, last_direction, last_sent_at")
        .in(
          "lead_id",
          leadIds.slice(
            index * LAST_MESSAGE_LEAD_BATCH_SIZE,
            (index + 1) * LAST_MESSAGE_LEAD_BATCH_SIZE,
          ),
        )
        .gte("last_sent_at", INBOX_MESSAGES_VISIBLE_SINCE),
    ),
  );
  const lastMessages: { lead_id: string; last_direction: string; last_sent_at: string }[] = [];
  for (const batch of lastMessageBatches) {
    if (batch.error) throw batch.error;
    lastMessages.push(...(batch.data ?? []));
  }

  const lastDirectionByLead = new Map<string, string>();
  const visibleLeadIds = new Set<string>();
  for (const row of lastMessages) {
    lastDirectionByLead.set(row.lead_id, row.last_direction);
    visibleLeadIds.add(row.lead_id);
  }

  const rawStages: PipelineStageDTO[] = (stageRows ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    sort_order: s.sort_order,
    is_final: s.is_final,
  }));
  const entryStages = rawStages.filter((stage) =>
    ["LEADS", "ENTRADA"].includes(stage.name.trim().toUpperCase()),
  );
  const canonicalEntryStage =
    entryStages.find((stage) => stage.name.trim().toUpperCase() === "LEADS") ??
    entryStages[0] ??
    null;
  const entryStageIds = new Set(entryStages.map((stage) => stage.id));
  const stages: PipelineStageDTO[] = rawStages
    .filter((stage) => !entryStageIds.has(stage.id) || stage.id === canonicalEntryStage?.id)
    .map((stage) =>
      stage.id === canonicalEntryStage?.id
        ? { ...stage, name: "LEADS", sort_order: Number.MIN_SAFE_INTEGER, is_final: false }
        : stage,
    )
    .sort((a, b) => a.sort_order - b.sort_order);

  const ownerNameById = new Map(
    (teamProfiles ?? []).map((profile) => [profile.id, formatTeamOption(profile).label]),
  );

  const allCards: PipelineCardDTO[] = (rows ?? [])
    .filter((o) => {
      const lead = nestOne((o as { leads: LeadN | LeadN[] | null }).leads);
      return !!o.lead_id && visibleLeadIds.has(o.lead_id) && !isLeadExcludedFromPipeline(lead);
    })
    .map((o) => {
      const card = mapRowToCard(
        o as unknown as Parameters<typeof mapRowToCard>[0],
        lastDirectionByLead,
      );
      const cardWithOwner = {
        ...card,
        ownerName: card.ownerId ? (ownerNameById.get(card.ownerId) ?? "Responsável desconhecido") : null,
      };
      return canonicalEntryStage && entryStageIds.has(card.stage_id)
        ? { ...cardWithOwner, stage_id: canonicalEntryStage.id }
        : cardWithOwner;
    });

  const cardsMatchingOtherFilters = allCards.filter((card) =>
    cardMatchesPipelineFilters(card, {
      ownerUserId: null,
      signal: signalFilter,
      region: regionFilter,
      clientCategory: categoryFilter,
      query,
    }),
  );

  const filteredCards = cardsMatchingOtherFilters.filter((card) =>
    !ownerUserId || card.ownerId === ownerUserId,
  );

  const summaryCards = ownerUserId
    ? allCards.filter(
        (card) =>
          card.ownerId === ownerUserId &&
          cardMatchesPipelineFilters(card, {
            ownerUserId: null,
            signal: null,
            region: regionFilter,
            clientCategory: categoryFilter,
            query,
          }),
      )
    : [];
  const finalStageIds = new Set(stages.filter((stage) => stage.is_final).map((stage) => stage.id));
  const openSummaryCards = summaryCards.filter((card) => !finalStageIds.has(card.stage_id));
  const selectedOwnerName = ownerUserId
    ? (ownerNameById.get(ownerUserId) ?? (mineOnly ? "Minha carteira" : "Responsável desconhecido"))
    : null;

  const countByOwner = new Map<string, number>();
  for (const card of cardsMatchingOtherFilters) {
    if (!card.ownerId) continue;
    countByOwner.set(card.ownerId, (countByOwner.get(card.ownerId) ?? 0) + 1);
  }
  const teamOptions = (teamProfiles ?? []).map((profile) => ({
    ...formatTeamOption(profile),
    count: countByOwner.get(profile.id) ?? 0,
  }));
  const mineCount = user?.id ? (countByOwner.get(user.id) ?? 0) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold">Funil</h1>
      </div>

      <Suspense fallback={<p className="text-sm text-[var(--muted)]">Carregando filtros…</p>}>
        <PipelineFilters
          totalCount={cardsMatchingOtherFilters.length}
          visibleCount={filteredCards.length}
          teamOptions={teamOptions}
          mineCount={mineCount}
          canViewTeam={canViewTeam}
        />
      </Suspense>

      {selectedOwnerName ? (
        <PipelineOwnerSummary
          ownerName={selectedOwnerName}
          isMine={mineOnly}
          openCount={openSummaryCards.length}
          awaitingReplyCount={openSummaryCards.filter((card) => card.signals.includes("awaiting_reply")).length}
          staleCount={openSummaryCards.filter((card) => card.signals.includes("stale")).length}
          overdueCount={openSummaryCards.filter((card) => card.signals.includes("followup_overdue")).length}
        />
      ) : null}

      {stages.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Nenhuma etapa do funil configurada.</p>
      ) : filteredCards.length === 0 ? (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-8 text-center text-sm text-[var(--muted)]">
          {query.trim().length > 0
            ? `Nenhuma oportunidade encontrada para «${query.trim()}». Tente outro nome, telefone ou limpe os filtros.`
            : "Nenhuma oportunidade corresponde aos filtros selecionados."}
        </p>
      ) : (
        <PipelineBoard
          stages={stages}
          initialCards={filteredCards}
          showOwners={canViewTeam && !mineOnly && !ownerParam}
        />
      )}
    </div>
  );
}
