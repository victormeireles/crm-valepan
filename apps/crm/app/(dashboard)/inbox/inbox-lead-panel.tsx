"use client";

import { lookupLeadCep, updateConversationLeadQualification, updateLeadOwner } from "@/app/actions/leads";
import { formatCaptureZip } from "@/lib/lead-capture";
import { updateConversationPipelineClassification } from "@/app/actions/inbox";
import { CityAutocompleteInput } from "@/components/city-autocomplete-input";
import { CrmMenuSelect } from "@/components/crm-menu-select";
import { LeadDistributorSelect } from "@/components/lead-distributor-select";
import { distributorOptionsForSelect, type DistributorOption } from "@/lib/distributors";
import { CrmIcon, type CrmIconName } from "@/components/crm-icon";
import { LeadFollowUp } from "@/components/lead-follow-up";
import type { LeadFollowUpDTO } from "@/lib/follow-ups";
import { useId, useMemo, useRef, useState } from "react";
import {
  displayPipelineStageName,
  isLostPipelineStage,
} from "@/lib/pipeline-canonical-stages";
import {
  isForwardedToDistributorSubstage,
  substagesForStageKey,
  type PipelineSubstageDTO,
} from "@/lib/pipeline-substages";
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
  initialSubstage: string | null;
  initialState: string | null;
  initialCity: string | null;
  initialZipCode: string | null;
  initialStreet: string | null;
  initialNeighborhood: string | null;
  initialWeeklyBreadConsumption: number | null;
  initialBreadWeightGrams: number | null;
  initialBreadType: string | null;
  initialCnpj: string | null;
  initialOwnerId: string | null;
  stages: StageOption[];
  substages: PipelineSubstageDTO[];
  distributors?: DistributorOption[];
  initialDistributorId?: string | null;
  distributorName?: string | null;
  onDistributorChange?: (distributorId: string | null) => void;
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
  street: string;
  neighborhood: string;
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
    zipCode: formatCaptureZip(props.initialZipCode ?? ""),
    street: props.initialStreet ?? "",
    neighborhood: props.initialNeighborhood ?? "",
    weeklyBreadConsumption: props.initialWeeklyBreadConsumption == null ? "" : String(props.initialWeeklyBreadConsumption),
    breadWeightGrams: props.initialBreadWeightGrams == null ? "" : String(props.initialBreadWeightGrams),
    breadType: props.initialBreadType ?? "",
    cnpj: props.initialCnpj ?? "",
    companyName: props.companyName ?? "",
  });
  const [ownerId, setOwnerId] = useState(props.initialOwnerId ?? "");
  const [substage, setSubstage] = useState(props.initialSubstage ?? "");
  const [savingField, setSavingField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const qualificationRef = useRef(qualification);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveVersionRef = useRef(0);

  const [volumeDraft, setVolumeDraft] = useState(qualification.weeklyBreadConsumption);
  const cepFieldId = useId();

  function updateQualificationDraft(patch: Partial<QualificationState>) {
    const next = { ...qualificationRef.current, ...patch };
    qualificationRef.current = next;
    setQualification(next);
    return next;
  }

  function saveQualification(patch: Partial<QualificationState>, field: string) {
    const next = updateQualificationDraft(patch);
    const saveVersion = ++saveVersionRef.current;
    setSavingField(field);
    setError(null);
    const persist = async () => {
      try {
        const result = await updateConversationLeadQualification({
          conversationId: props.conversationId,
          category: next.category || null,
          stageId: next.stageId || null,
          state: next.state || null,
          city: next.city || null,
          zipCode: next.zipCode || null,
          street: next.street || null,
          neighborhood: next.neighborhood || null,
          weeklyBreadConsumption: next.weeklyBreadConsumption || null,
          companyName: next.companyName || null,
          cnpj: next.cnpj || null,
          breadType: next.breadType || null,
          breadWeightGrams: next.breadWeightGrams || null,
        });
        if (!result.ok && saveVersion === saveVersionRef.current) {
          setError(result.error ?? "Não foi possível salvar.");
        }
      } catch {
        if (saveVersion === saveVersionRef.current) {
          setError("Não foi possível salvar. Tente novamente.");
        }
      } finally {
        if (saveVersion === saveVersionRef.current) setSavingField(null);
      }
    };

    // Impede que dois onBlur concorrentes terminem fora de ordem e que uma
    // resposta antiga sobrescreva dados digitados logo em seguida.
    const queued = saveQueueRef.current.then(persist, persist);
    saveQueueRef.current = queued;
    return queued;
  }

  function onZipChange(raw: string) {
    updateQualificationDraft({ zipCode: formatCaptureZip(raw) });
  }

  async function lookupAddressFromCep() {
    const formatted = formatCaptureZip(qualificationRef.current.zipCode);
    const digits = formatted.replace(/\D/g, "");
    if (digits.length !== 8) {
      setError("Informe um CEP com 8 dígitos.");
      return;
    }
    setSavingField("zip");
    setError(null);
    try {
      const lookedUp = await lookupLeadCep(digits);
      if (!lookedUp.ok) {
        setError(lookedUp.error);
        setSavingField(null);
        return;
      }
      await saveQualification({
        zipCode: formatCaptureZip(lookedUp.address.zipCode),
        street: lookedUp.address.street ?? "",
        neighborhood: lookedUp.address.neighborhood ?? "",
        city: lookedUp.address.city,
        state: lookedUp.address.state,
      }, "zip");
    } catch {
      setError("Não foi possível buscar o CEP. Tente novamente.");
      setSavingField(null);
    }
  }

  async function saveOwner(nextOwnerId: string) {
    setOwnerId(nextOwnerId);
    setSavingField("owner");
    setError(null);
    try {
      const result = await updateLeadOwner({ leadId: props.leadId, ownerId: nextOwnerId || null });
      if (!result.ok) setError(result.error ?? "Não foi possível salvar o responsável.");
    } catch {
      setError("Não foi possível salvar o responsável. Tente novamente.");
    } finally {
      setSavingField(null);
    }
  }

  const orderedStages = useMemo(
    () => [...props.stages].sort((a, b) => a.sortOrder - b.sortOrder),
    [props.stages],
  );
  const currentStage = orderedStages.find((stage) => stage.id === qualification.stageId) ?? null;
  const statusOptions = substagesForStageKey(props.substages, currentStage?.name ?? null, substage);
  const statusRequired = isLostPipelineStage(currentStage?.name);
  const currentIndex = orderedStages.findIndex((stage) => stage.id === qualification.stageId);
  const nextStage = orderedStages.slice(Math.max(0, currentIndex + 1)).find((stage) => !stage.isFinal) ?? null;

  async function saveStageAndStatus(nextStageId: string, nextStatus: string) {
    const stage = orderedStages.find((item) => item.id === nextStageId) ?? null;
    const options = substagesForStageKey(props.substages, stage?.name ?? null, nextStatus);
    const compatibleStatus = options.includes(nextStatus) ? nextStatus : "";
    updateQualificationDraft({ stageId: nextStageId });
    setSubstage(compatibleStatus);
    if (isLostPipelineStage(stage?.name) && !compatibleStatus) {
      return;
    }
    setSavingField("stage");
    setError(null);
    try {
      const result = await updateConversationPipelineClassification({
        conversationId: props.conversationId,
        stageId: nextStageId || null,
        substage: compatibleStatus || null,
      });
      if (!result.ok) {
        setError(result.error ?? "Não foi possível salvar.");
        updateQualificationDraft({ stageId: props.initialStageId ?? "" });
        setSubstage(props.initialSubstage ?? "");
        return;
      }
      updateQualificationDraft({ stageId: result.stageId ?? "" });
      setSubstage(result.substage ?? "");
    } catch {
      setError("Não foi possível salvar. Tente novamente.");
    } finally {
      setSavingField(null);
    }
  }

  async function moveToNextStage() {
    if (!nextStage) return;
    await saveStageAndStatus(nextStage.id, substage);
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
            <CrmMenuSelect
              label="Etapa"
              variant="row"
              value={qualification.stageId}
              disabled={savingField === "stage"}
              options={[
                { value: "", label: "Não definida" },
                ...orderedStages.map((stage) => ({
                  value: stage.id,
                  label: displayPipelineStageName(stage.name),
                })),
              ]}
              onChange={(next) => {
                const stage = orderedStages.find((item) => item.id === next) ?? null;
                const nextOptions = substagesForStageKey(props.substages, stage?.name ?? null, "");
                const nextStatus = nextOptions.includes(substage) ? substage : "";
                void saveStageAndStatus(next, nextStatus);
              }}
            />
            <CrmMenuSelect
              label="Status"
              variant="row"
              value={substage}
              disabled={!qualification.stageId || statusOptions.length === 0 || savingField === "stage"}
              options={[
                { value: "", label: statusRequired ? "Selecione o status" : "Sem status" },
                ...statusOptions.map((name) => ({ value: name, label: name })),
              ]}
              onChange={(next) => void saveStageAndStatus(qualification.stageId, next)}
            />
            {isForwardedToDistributorSubstage(substage) ? (
              <LeadDistributorSelect
                leadId={props.leadId}
                options={distributorOptionsForSelect(
                  props.distributors ?? [],
                  props.initialDistributorId
                    ? {
                        id: props.initialDistributorId,
                        name: props.distributorName?.trim() || "Distribuidor atual",
                      }
                    : null,
                )}
                distributorId={props.initialDistributorId ?? null}
                onSaved={props.onDistributorChange}
                appearance="row"
              />
            ) : null}
            <CrmMenuSelect
              label="Tipo de cliente"
              variant="row"
              value={qualification.category}
              options={[
                { value: "", label: "Não informado" },
                { value: "hamburgueria", label: "Hamburgueria" },
                { value: "distribuidor", label: "Distribuidor" },
                { value: "parceiros", label: "Parceiros" },
                { value: "outros", label: "Outros" },
              ]}
              onChange={(next) => void saveQualification({ category: next }, "category")}
            />
            <div className="flex min-h-11 items-center justify-between gap-2 rounded-[10px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper)] px-3">
              <label htmlFor={cepFieldId} className="shrink-0 text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--vp-ink-soft)]">CEP</label>
              <input
                id={cepFieldId}
                className={controlClass}
                value={qualification.zipCode}
                inputMode="numeric"
                autoComplete="postal-code"
                placeholder="00000-000"
                onChange={(event) => onZipChange(event.target.value)}
                onBlur={() => void saveQualification({ zipCode: qualificationRef.current.zipCode }, "zip")}
              />
              <button
                type="button"
                title="Buscar endereço pelo CEP"
                className="relative grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg border border-[var(--vp-gold-classic)] bg-[var(--vp-gold-cream)] text-[var(--vp-wine)] transition-colors duration-200 after:absolute after:-inset-1.5 after:content-[''] hover:bg-[var(--vp-gold)] active:bg-[var(--vp-gold-dim)] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Buscar endereço pelo CEP"
                aria-busy={savingField === "zip"}
                disabled={savingField === "zip" || qualification.zipCode.replace(/\D/g, "").length !== 8}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void lookupAddressFromCep()}
              >
                <CrmIcon name={savingField === "zip" ? "progress_activity" : "search"} className={`text-base ${savingField === "zip" ? "animate-spin" : ""}`} />
              </button>
            </div>
            <label className="flex min-h-11 items-center justify-between gap-2.5 rounded-[10px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper)] px-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--vp-ink-soft)]">Logradouro</span>
              <input
                className={controlClass}
                value={qualification.street}
                placeholder="Rua, avenida"
                onChange={(event) => updateQualificationDraft({ street: event.target.value })}
                onBlur={() => void saveQualification({ street: qualificationRef.current.street }, "street")}
              />
            </label>
            <label className="flex min-h-11 items-center justify-between gap-2.5 rounded-[10px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper)] px-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--vp-ink-soft)]">Bairro</span>
              <input
                className={controlClass}
                value={qualification.neighborhood}
                placeholder="Não informado"
                onChange={(event) => updateQualificationDraft({ neighborhood: event.target.value })}
                onBlur={() => void saveQualification({ neighborhood: qualificationRef.current.neighborhood }, "neighborhood")}
              />
            </label>
            <label className="flex min-h-11 items-center justify-between gap-2.5 rounded-[10px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper)] px-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--vp-ink-soft)]">Cidade</span>
              <CityAutocompleteInput
                className={controlClass}
                value={qualification.city}
                onChange={(city) => updateQualificationDraft({ city })}
                onBlur={() => void saveQualification({ city: qualificationRef.current.city }, "city")}
                stateFilter={qualification.state}
                placeholder="Não informada"
                disabled={savingField === "city"}
              />
            </label>
            <label className="flex min-h-11 items-center justify-between gap-2.5 rounded-[10px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper)] px-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--vp-ink-soft)]">UF</span>
              <input
                className={controlClass}
                value={qualification.state}
                maxLength={2}
                placeholder="UF"
                onChange={(event) => updateQualificationDraft({ state: event.target.value.toUpperCase() })}
                onBlur={() => void saveQualification({ state: qualificationRef.current.state }, "state")}
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
            <CrmMenuSelect
              label="Responsável"
              variant="row"
              value={ownerId}
              disabled={savingField === "owner"}
              options={[
                { value: "", label: "Sem responsável" },
                ...props.teamOptions.map((option) => ({ value: option.id, label: option.label })),
              ]}
              onChange={(next) => void saveOwner(next)}
            />
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
          disabled={!nextStage || savingField === "stage"}
          onClick={() => void moveToNextStage()}
        >
          {savingField === "stage" && nextStage ? "Movendo…" : nextStage ? `Mover para ${displayPipelineStageName(nextStage.name)}` : "Última etapa do funil"}
        </button>
      </footer>
    </aside>
  );
}

export function InboxLeadPanelDrawer({
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
  ...props
}: InboxLeadPanelProps & {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };
  return (
    <>
      {!hideTrigger ? (
        <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-3 text-xs font-bold text-[var(--vp-wine)] xl:hidden" onClick={() => setOpen(true)}>
          <CrmIcon name="contact_page" className="text-base" />
          Ficha
        </button>
      ) : null}
      {open ? (
        <div className="fixed inset-0 z-50 bg-[rgba(35,0,4,0.35)] xl:hidden" role="dialog" aria-modal="true" aria-label="Ficha do lead">
          <div className="absolute inset-y-0 right-0 w-[min(92vw,348px)] p-2">
            <button type="button" className="absolute right-5 top-5 z-10 grid size-9 place-items-center rounded-full bg-[var(--vp-surface)] text-[var(--vp-wine)]" onClick={() => setOpen(false)} aria-label="Fechar ficha">
              <CrmIcon name="close" className="text-xl" />
            </button>
            <InboxLeadPanel key={props.conversationId} {...props} />
          </div>
        </div>
      ) : null}
    </>
  );
}
