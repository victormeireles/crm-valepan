"use client";

import { updateConversationLeadQualification, updateLeadOwner } from "@/app/actions/leads";
import { updateOpportunityStage } from "@/app/actions/opportunity";
import { CityAutocompleteInput } from "@/components/city-autocomplete-input";
import { CrmIcon, type CrmIconName } from "@/components/crm-icon";
import { LeadFollowUp } from "@/components/lead-follow-up";
import type { LeadFollowUpDTO } from "@/lib/follow-ups";
import { useMemo, useState } from "react";
import { InboxTasksPanel, type InboxTaskRow } from "./inbox-tasks-panel";

type StageOption = { id: string; name: string; sortOrder: number; isFinal?: boolean };
type TeamOption = { id: string; label: string };
type HistoryItem = { id: string; label: string; at: string; icon: string };

export type InboxLeadPanelProps = {
  conversationId: string;
  leadId: string;
  contactName: string;
  companyName: string | null;
  initialCategory: string | null;
  initialStageId: string | null;
  initialState: string | null;
  initialCity: string | null;
  initialZipCode: string | null;
  initialWeeklyBreadConsumption: number | null;
  initialBreadWeightGrams: number | null;
  initialBreadType: string | null;
  initialCnpj: string | null;
  initialOwnerId: string | null;
  stages: StageOption[];
  teamOptions: TeamOption[];
  opportunityId: string | null;
  followUp: LeadFollowUpDTO | null;
  tasks: InboxTaskRow[];
  assigneeLabels: Record<string, string>;
  history: HistoryItem[];
};

type QualificationState = {
  category: string;
  stageId: string;
  state: string;
  city: string;
  zipCode: string;
  weeklyBreadConsumption: string;
  breadWeightGrams: string;
  breadType: string;
  cnpj: string;
  companyName: string;
};

export function InboxLeadPanel(props: InboxLeadPanelProps) {
  const [qualification, setQualification] = useState<QualificationState>({
    category: props.initialCategory ?? "",
    stageId: props.initialStageId ?? "",
    state: props.initialState ?? "",
    city: props.initialCity ?? "",
    zipCode: props.initialZipCode ?? "",
    weeklyBreadConsumption: props.initialWeeklyBreadConsumption == null ? "" : String(props.initialWeeklyBreadConsumption),
    breadWeightGrams: props.initialBreadWeightGrams == null ? "" : String(props.initialBreadWeightGrams),
    breadType: props.initialBreadType ?? "",
    cnpj: props.initialCnpj ?? "",
    companyName: props.companyName ?? "",
  });
  const [ownerId, setOwnerId] = useState(props.initialOwnerId ?? "");
  const [savingField, setSavingField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [volumeDraft, setVolumeDraft] = useState(qualification.weeklyBreadConsumption);

  async function saveQualification(patch: Partial<QualificationState>, field: string) {
    const next = { ...qualification, ...patch };
    setQualification(next);
    setSavingField(field);
    setError(null);
    const result = await updateConversationLeadQualification({
      conversationId: props.conversationId,
      category: next.category || null,
      stageId: next.stageId || null,
      state: next.state || null,
      city: next.city || null,
      zipCode: next.zipCode || null,
      weeklyBreadConsumption: next.weeklyBreadConsumption || null,
      companyName: next.companyName || null,
      cnpj: next.cnpj || null,
      breadType: next.breadType || null,
      breadWeightGrams: next.breadWeightGrams || null,
    });
    setSavingField(null);
    if (!result.ok) setError(result.error ?? "Não foi possível salvar.");
  }

  async function saveOwner(nextOwnerId: string) {
    setOwnerId(nextOwnerId);
    setSavingField("owner");
    setError(null);
    const result = await updateLeadOwner({ leadId: props.leadId, ownerId: nextOwnerId || null });
    setSavingField(null);
    if (!result.ok) setError(result.error ?? "Não foi possível salvar o responsável.");
  }

  const orderedStages = useMemo(
    () => [...props.stages].sort((a, b) => a.sortOrder - b.sortOrder),
    [props.stages],
  );
  const currentIndex = orderedStages.findIndex((stage) => stage.id === qualification.stageId);
  const nextStage = orderedStages.slice(Math.max(0, currentIndex + 1)).find((stage) => !stage.isFinal) ?? null;

  async function moveToNextStage() {
    if (!props.opportunityId || !nextStage) return;
    setSavingField("nextStage");
    setError(null);
    const result = await updateOpportunityStage({
      opportunityId: props.opportunityId,
      stageId: nextStage.id,
      lostReason: null,
    });
    setSavingField(null);
    if (!result.ok) {
      setError(result.error ?? "Não foi possível mover a oportunidade.");
      return;
    }
    setQualification((current) => ({ ...current, stageId: nextStage.id }));
  }

  const controlClass = "min-w-0 flex-1 border-0 bg-transparent text-right text-[13px] font-bold text-[var(--vp-ink-body)] outline-none";

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-[14px] border border-l-[3px] border-[var(--vp-ink-line)] border-l-[var(--vp-gold-classic)] bg-[var(--vp-paper-pure)] shadow-[var(--sh-sm)]">
      <header className="shrink-0 border-b border-[var(--vp-ink-line)] px-4 py-3.5">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--vp-gold-classic)]">Ficha do lead</p>
        <p className="mt-1 truncate text-[15px] font-bold text-[var(--vp-wine)]">{props.companyName ?? props.contactName}</p>
      </header>

      <div className="min-h-0 flex-1 space-y-[18px] overflow-y-auto p-4">
        <section>
          <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--vp-ink-soft)]">Qualificação</p>
          <div className="space-y-2">
            <label className="flex min-h-11 items-center justify-between gap-2.5 rounded-[10px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper)] px-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--vp-ink-soft)]">Etapa</span>
              <select className={controlClass} value={qualification.stageId} onChange={(event) => void saveQualification({ stageId: event.target.value }, "stage")}>
                <option value="">Não definida</option>
                {orderedStages.filter((stage) => !stage.isFinal).map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
              </select>
            </label>
            <label className="flex min-h-11 items-center justify-between gap-2.5 rounded-[10px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper)] px-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--vp-ink-soft)]">Tipo de cliente</span>
              <select className={controlClass} value={qualification.category} onChange={(event) => void saveQualification({ category: event.target.value }, "category")}>
                <option value="">Não informado</option>
                <option value="hamburgueria">Hamburgueria</option>
                <option value="distribuidor">Distribuidor</option>
                <option value="parceiros">Parceiros</option>
                <option value="outros">Outros</option>
              </select>
            </label>
            <label className="flex min-h-11 items-center justify-between gap-2.5 rounded-[10px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper)] px-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--vp-ink-soft)]">Cidade</span>
              <CityAutocompleteInput
                className={controlClass}
                value={qualification.city}
                onChange={(city) => setQualification((current) => ({ ...current, city }))}
                onBlur={() => void saveQualification({ city: qualification.city }, "city")}
                stateFilter={qualification.state}
                placeholder="Não informada"
                disabled={savingField === "city"}
              />
            </label>
            <label className="flex min-h-11 items-center justify-between gap-2.5 rounded-[10px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper)] px-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--vp-ink-soft)]">Volume</span>
              <span className="flex min-w-0 flex-1 items-center justify-end gap-1">
                <input
                  className={controlClass}
                  value={volumeDraft}
                  inputMode="numeric"
                  placeholder="Não informado"
                  onChange={(event) => setVolumeDraft(event.target.value.replace(/\D/g, ""))}
                  onBlur={() => void saveQualification({ weeklyBreadConsumption: volumeDraft }, "volume")}
                />
                {volumeDraft ? <span className="text-[11px] font-bold text-[var(--vp-ink-soft)]">pães/sem</span> : null}
              </span>
            </label>
            <label className="flex min-h-11 items-center justify-between gap-2.5 rounded-[10px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper)] px-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--vp-ink-soft)]">Responsável</span>
              <select className={controlClass} value={ownerId} onChange={(event) => void saveOwner(event.target.value)}>
                <option value="">Sem responsável</option>
                {props.teamOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
          </div>
          <p className="mt-1.5 min-h-4 text-[11px] text-[var(--vp-ink-soft)]" aria-live="polite">
            {savingField && savingField !== "nextStage" ? "salvando…" : ""}
          </p>
          {error ? <p className="text-[11px] text-[var(--vp-error)]" role="alert">{error}</p> : null}
        </section>

        <LeadFollowUp
          leadId={props.leadId}
          initialFollowUp={props.followUp}
          teamOptions={props.teamOptions}
          defaultAssigneeId={ownerId || null}
          compact
        />

        <InboxTasksPanel
          leadId={props.leadId}
          leadLabel={props.contactName}
          opportunityId={props.opportunityId}
          tasks={props.tasks}
          teamOptions={props.teamOptions}
          assigneeLabels={props.assigneeLabels}
          defaultAssigneeId={ownerId || null}
        />

        <section>
          <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--vp-ink-soft)]">Histórico</p>
          <ul className="space-y-2.5">
            {props.history.length === 0 ? <li className="text-xs text-[var(--vp-ink-muted)]">Ainda não há eventos recentes.</li> : props.history.map((item) => (
              <li key={item.id} className="flex gap-2.5 text-xs">
                <CrmIcon name={item.icon as CrmIconName} className="text-[17px] text-[var(--vp-gold-classic)]" />
                <span className="min-w-0">
                  <span className="block text-[var(--vp-ink-body)]">{item.label}</span>
                  <time dateTime={item.at} className="block text-[11px] text-[var(--vp-ink-soft)]">{new Date(item.at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</time>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <footer className="shrink-0 border-t border-[var(--vp-ink-line)] px-4 py-3">
        <button
          type="button"
          className="min-h-11 w-full rounded-full bg-[var(--vp-wine)] px-3 text-[13px] font-bold text-[var(--vp-gold)] disabled:opacity-50"
          disabled={!nextStage || !props.opportunityId || savingField === "nextStage"}
          onClick={() => void moveToNextStage()}
        >
          {savingField === "nextStage" ? "Movendo…" : nextStage ? `Mover para ${nextStage.name}` : "Última etapa do funil"}
        </button>
      </footer>
    </aside>
  );
}

export function InboxLeadPanelDrawer(props: InboxLeadPanelProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-3 text-xs font-bold text-[var(--vp-wine)] xl:hidden" onClick={() => setOpen(true)}>
        <CrmIcon name="contact_page" className="text-base" />
        Ficha
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 bg-[rgba(35,0,4,0.35)] xl:hidden" role="dialog" aria-modal="true" aria-label="Ficha do lead">
          <div className="absolute inset-y-0 right-0 w-[min(92vw,348px)] p-2">
            <button type="button" className="absolute right-5 top-5 z-10 grid size-9 place-items-center rounded-full bg-[var(--vp-surface)] text-[var(--vp-wine)]" onClick={() => setOpen(false)} aria-label="Fechar ficha">
              <CrmIcon name="close" className="text-xl" />
            </button>
            <InboxLeadPanel {...props} />
          </div>
        </div>
      ) : null}
    </>
  );
}
