"use client";

import type { PipelinePageFilters, PipelineVolumeFilter } from "@/app/actions/pipeline";
import type { ClientCategoryValue } from "@/lib/client-categories";
import type { PipelineRegion } from "@/lib/pipeline-signals";
import { CrmIcon } from "@/components/crm-icon";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { LostReasonDTO } from "@/lib/lost-reasons";
import { substagesForStageKey } from "@/lib/pipeline-substages";
import { canonicalPipelineStageKey, displayPipelineStageName, findCanonicalPipelineStage } from "@/lib/pipeline-canonical-stages";
import type { PipelineStageDTO } from "./pipeline-board";

const SEARCH_DEBOUNCE_MS = 500;

type FilterChangeHandler = (
  patch: Record<string, string | null>,
  historyMode?: "push" | "replace",
) => void;

function PipelineSearch({
  query,
  onSearch,
}: {
  query: string;
  onSearch: (value: string) => void;
}) {
  const [draft, setDraft] = useState(query);
  const lastCommitted = useRef(query.trim());

  useEffect(() => {
    setDraft(query);
    lastCommitted.current = query.trim();
  }, [query]);

  useEffect(() => {
    const trimmed = draft.trim();
    if (trimmed === lastCommitted.current) return;
    const id = window.setTimeout(() => {
      lastCommitted.current = trimmed;
      onSearch(trimmed);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [draft, onSearch]);

  return (
    <label className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-full border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-3.5 shadow-[var(--sh-sm)] sm:w-[18rem] sm:flex-none">
      <CrmIcon name="search" className="text-lg text-[var(--vp-wine)]" />
      <span className="sr-only">Buscar no funil</span>
      <input
        type="search"
        value={draft}
        placeholder="Buscar lead, empresa ou telefone"
        className="w-full border-0 bg-transparent text-[13px] text-[var(--vp-ink-body)] outline-none placeholder:text-[var(--vp-ink-soft)]"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          const trimmed = event.currentTarget.value.trim();
          lastCommitted.current = trimmed;
          onSearch(trimmed);
        }}
      />
    </label>
  );
}

type TeamOption = { id: string; label: string; count: number };

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "Sem nome";
}

function triggerClass(active: boolean) {
  return `inline-flex min-h-11 max-w-[16rem] cursor-pointer list-none items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-semibold transition-colors duration-200 marker:content-none [&::-webkit-details-marker]:hidden ${
    active
      ? "border-[var(--vp-wine)] bg-[var(--vp-wine)] text-[var(--vp-gold)]"
      : "border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] text-[var(--vp-ink-muted)] hover:border-[var(--vp-wine-soft)] hover:text-[var(--vp-ink-body)]"
  }`;
}

function ToolbarMenu({
  label,
  active = false,
  ariaLabel,
  panelClassName = "min-w-52",
  children,
}: {
  label: ReactNode;
  active?: boolean;
  ariaLabel: string;
  panelClassName?: string;
  children: ReactNode;
}) {
  return (
    <details
      name="pipeline-toolbar"
      className="group relative shrink-0"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.currentTarget.removeAttribute("open");
      }}
    >
      <summary aria-label={ariaLabel} className={triggerClass(active)}>
        <span className="min-w-0 truncate">{label}</span>
        <CrmIcon name="expand_more" className="shrink-0 text-[16px] transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className={`absolute left-0 z-40 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] py-1 shadow-[var(--sh-md)] ${panelClassName}`}>
        {children}
      </div>
    </details>
  );
}

function MenuOption({
  selected,
  onSelect,
  trailing,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`flex min-h-11 w-full items-center gap-2 px-3 text-left text-[13px] hover:bg-[var(--vp-surface)] ${
        selected ? "font-bold text-[var(--vp-wine)]" : "text-[var(--vp-ink-muted)]"
      }`}
      onClick={(event) => {
        onSelect();
        event.currentTarget.closest("details")?.removeAttribute("open");
      }}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing ? <span className="shrink-0 tabular-nums opacity-70">{trailing}</span> : null}
      {selected ? <CrmIcon name="check" className="shrink-0 text-base" /> : null}
    </button>
  );
}

function OwnerAvatar({ value }: { value: string }) {
  return (
    <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-[var(--vp-gold)] text-[10px] font-extrabold text-[var(--vp-wine)]">
      {value}
    </span>
  );
}

function OwnerMenu({
  teamOptions,
  mineCount,
  totalCount,
  currentUserId,
  selectedOwnerId,
  onFilterChange,
}: {
  teamOptions: TeamOption[];
  mineCount: number;
  totalCount: number;
  currentUserId: string | null;
  selectedOwnerId: string | null;
  onFilterChange: FilterChangeHandler;
}) {
  const number = new Intl.NumberFormat("pt-BR");
  const selectedOption = teamOptions.find((option) => option.id === selectedOwnerId);
  const isMine = Boolean(currentUserId && selectedOwnerId === currentUserId);
  const triggerLabel = !selectedOwnerId
    ? `Todos ${number.format(totalCount)}`
    : isMine
      ? `Meus ${number.format(mineCount)}`
      : `${firstName(selectedOption?.label ?? "Vendedor")} ${number.format(selectedOption?.count ?? 0)}`;
  const triggerAvatar = !selectedOwnerId
    ? null
    : isMine
      ? "EU"
      : initials(selectedOption?.label ?? "") || "?";

  return (
    <ToolbarMenu
      active={Boolean(selectedOwnerId)}
      ariaLabel={`Vendedor: ${triggerLabel}`}
      panelClassName="min-w-60"
      label={
        <span className="inline-flex min-w-0 items-center gap-1.5">
          {triggerAvatar ? <OwnerAvatar value={triggerAvatar} /> : null}
          <span className="truncate">{triggerLabel}</span>
        </span>
      }
    >
      <MenuOption
        selected={!selectedOwnerId}
        trailing={number.format(totalCount)}
        onSelect={() => onFilterChange({ mine: null, owner: null })}
      >
        Todos
      </MenuOption>
      {currentUserId ? (
        <MenuOption
          selected={isMine}
          trailing={number.format(mineCount)}
          onSelect={() => onFilterChange({ mine: "1", owner: null })}
        >
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <OwnerAvatar value="EU" />
            Meus
          </span>
        </MenuOption>
      ) : null}
      {teamOptions.filter((option) => option.id !== currentUserId).map((option) => (
        <MenuOption
          key={option.id}
          selected={selectedOwnerId === option.id}
          trailing={number.format(option.count)}
          onSelect={() => onFilterChange({ mine: null, owner: option.id })}
        >
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <OwnerAvatar value={initials(option.label) || "?"} />
            <span className="truncate">{firstName(option.label)}</span>
          </span>
        </MenuOption>
      ))}
    </ToolbarMenu>
  );
}

function ArchiveShortcut({
  label,
  count,
  active,
  ariaLabel,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  ariaLabel: string;
  onClick: () => void;
}) {
  const number = new Intl.NumberFormat("pt-BR");
  return (
    <button
      type="button"
      className={triggerClass(active)}
      aria-label={ariaLabel}
      aria-pressed={active}
      onClick={onClick}
    >
      <span>{label}</span>
      <span className="tabular-nums opacity-80">{number.format(count)}</span>
    </button>
  );
}

export function PipelineHeader({
  stages,
  teamOptions,
  mineCount,
  canViewTeam,
  currentUserId,
  filters,
  pending,
  hasAnyFilter,
  totalCount,
  lostReasons,
  stageTotals,
  suggestionCount,
  onFilterChange,
}: {
  stages: PipelineStageDTO[];
  teamOptions: TeamOption[];
  mineCount: number;
  canViewTeam: boolean;
  currentUserId: string | null;
  filters: PipelinePageFilters;
  pending: boolean;
  hasAnyFilter: boolean;
  totalCount: number;
  lostReasons: LostReasonDTO[];
  stageTotals: Record<string, number>;
  suggestionCount: number;
  onFilterChange: FilterChangeHandler;
}) {
  const handleSearch = useCallback(
    (value: string) => {
      onFilterChange({ q: value || null }, "replace");
    },
    [onFilterChange],
  );

  const selectedStage = stages.find((stage) => stage.id === filters.stageId);
  const selectedStageKey = selectedStage ? canonicalPipelineStageKey(selectedStage.name) : null;
  const statusNames = selectedStageKey
    ? substagesForStageKey(lostReasons, selectedStageKey, filters.lostReason)
    : Array.from(
        new Set(
          lostReasons
            .filter((reason) => reason.active)
            .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "pt-BR"))
            .map((reason) => reason.name),
        ),
      );
  const clientStage = findCanonicalPipelineStage(stages, "CONVERTIDO");
  const lostStage = findCanonicalPipelineStage(stages, "PERDIDO");
  const clientCount = clientStage ? stageTotals[clientStage.id] ?? 0 : 0;
  const lostCount = lostStage ? stageTotals[lostStage.id] ?? 0 : 0;
  const regionLabels: Record<PipelineRegion, string> = { sp: "São Paulo", rj: "Rio" };
  const categoryLabels: Record<ClientCategoryValue, string> = {
    hamburgueria: "Hamburgueria",
    distribuidor: "Distribuidor",
    parceiros: "Parceiros",
    outros: "Outros",
  };
  const volumeLabels: Record<Exclude<PipelineVolumeFilter, null>, string> = {
    informado: "Informado",
    ate_100: "Até 100",
    acima_100: "Acima de 100",
  };

  return (
    <header className="flex flex-col gap-3">
      <h1
        className="text-[40px] leading-none tracking-[0.01em] text-[var(--vp-wine)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Funil comercial
      </h1>
      <div className="flex flex-wrap items-center gap-2" aria-busy={pending || undefined}>
        <PipelineSearch query={filters.query} onSearch={handleSearch} />
        {canViewTeam ? (
          <OwnerMenu
            teamOptions={teamOptions}
            mineCount={mineCount}
            totalCount={totalCount}
            currentUserId={currentUserId}
            selectedOwnerId={filters.ownerUserId}
            onFilterChange={onFilterChange}
          />
        ) : null}
        <ToolbarMenu
          active={Boolean(filters.region)}
          ariaLabel={`Região: ${filters.region ? regionLabels[filters.region] : "todas"}`}
          label={filters.region ? regionLabels[filters.region] : "Região"}
        >
          <MenuOption selected={!filters.region} onSelect={() => onFilterChange({ region: null })}>Todas</MenuOption>
          <MenuOption selected={filters.region === "sp"} onSelect={() => onFilterChange({ region: "sp" })}>São Paulo (DDD 11)</MenuOption>
          <MenuOption selected={filters.region === "rj"} onSelect={() => onFilterChange({ region: "rj" })}>Rio de Janeiro (DDD 21)</MenuOption>
        </ToolbarMenu>
        <ToolbarMenu
          active={Boolean(filters.clientCategory)}
          ariaLabel={`Tipo de cliente: ${filters.clientCategory ? categoryLabels[filters.clientCategory] : "todos"}`}
          label={filters.clientCategory ? categoryLabels[filters.clientCategory] : "Tipo"}
        >
          <MenuOption selected={!filters.clientCategory} onSelect={() => onFilterChange({ client_category: null })}>Todos</MenuOption>
          {Object.entries(categoryLabels).map(([value, label]) => (
            <MenuOption
              key={value}
              selected={filters.clientCategory === value}
              onSelect={() => onFilterChange({ client_category: value })}
            >
              {label}
            </MenuOption>
          ))}
        </ToolbarMenu>
        <ToolbarMenu
          active={Boolean(filters.stageId)}
          ariaLabel={`Etapa: ${selectedStage ? displayPipelineStageName(selectedStage.name) : "funil aberto"}`}
          label={selectedStage ? displayPipelineStageName(selectedStage.name) : "Etapa"}
        >
          <MenuOption selected={!filters.stageId} onSelect={() => onFilterChange({ stage: null })}>Funil aberto</MenuOption>
          {stages.map((stage) => (
            <MenuOption
              key={stage.id}
              selected={filters.stageId === stage.id}
              onSelect={() => onFilterChange({ stage: stage.id })}
            >
              {displayPipelineStageName(stage.name)}
            </MenuOption>
          ))}
        </ToolbarMenu>
        <ToolbarMenu
          active={Boolean(filters.volume)}
          ariaLabel={`Volume: ${filters.volume ? volumeLabels[filters.volume] : "qualquer"}`}
          label={filters.volume ? volumeLabels[filters.volume] : "Volume"}
        >
          <MenuOption selected={!filters.volume} onSelect={() => onFilterChange({ volume: null })}>Qualquer volume</MenuOption>
          <MenuOption selected={filters.volume === "informado"} onSelect={() => onFilterChange({ volume: "informado" })}>Volume informado</MenuOption>
          <MenuOption selected={filters.volume === "ate_100"} onSelect={() => onFilterChange({ volume: "ate_100" })}>Até 100 pães/sem</MenuOption>
          <MenuOption selected={filters.volume === "acima_100"} onSelect={() => onFilterChange({ volume: "acima_100" })}>Acima de 100 pães/sem</MenuOption>
        </ToolbarMenu>
        <ToolbarMenu
          active={Boolean(filters.lostReason)}
          ariaLabel={`Status: ${filters.lostReason ?? "todos"}`}
          label={filters.lostReason ?? "Status"}
        >
          <MenuOption selected={!filters.lostReason} onSelect={() => onFilterChange({ lost_reason: null })}>Todos</MenuOption>
          {statusNames.map((name) => (
            <MenuOption
              key={name}
              selected={filters.lostReason === name}
              onSelect={() => onFilterChange({ lost_reason: name })}
            >
              {name}
            </MenuOption>
          ))}
        </ToolbarMenu>
        {clientStage ? (
          <ArchiveShortcut
            label="Clientes"
            count={clientCount}
            active={filters.stageId === clientStage.id}
            ariaLabel={`Arquivo de clientes: ${clientCount}`}
            onClick={() => onFilterChange({
              stage: filters.stageId === clientStage.id ? null : clientStage.id,
            })}
          />
        ) : null}
        {lostStage ? (
          <ArchiveShortcut
            label="Perdidos"
            count={lostCount}
            active={filters.stageId === lostStage.id}
            ariaLabel={`Arquivo de perdidos: ${lostCount}`}
            onClick={() => onFilterChange({
              stage: filters.stageId === lostStage.id ? null : lostStage.id,
            })}
          />
        ) : null}
        <Link
          href="/pipeline/sugestoes"
          className={triggerClass(suggestionCount > 0)}
          aria-label={`Sugestões de avanço: ${suggestionCount}`}
        >
          <span>Sugestões</span>
          <span className="tabular-nums opacity-80">{new Intl.NumberFormat("pt-BR").format(suggestionCount)}</span>
        </Link>
        {hasAnyFilter ? (
          <button
            type="button"
            className="min-h-11 cursor-pointer px-2 text-[13px] font-semibold text-[var(--vp-wine)] hover:underline"
            onClick={() => onFilterChange({ mine: null, owner: null, signal: null, region: null, client_category: null, stage: null, volume: null, lost_reason: null, q: null })}
          >
            Limpar
          </button>
        ) : null}
        {pending ? (
          <span className="inline-flex min-h-11 items-center gap-1.5 text-[12px] text-[var(--vp-ink-soft)]">
            <CrmIcon name="progress_activity" className="animate-spin text-base text-[var(--vp-wine)]" />
            Atualizando
          </span>
        ) : null}
        <div className="sr-only" aria-live="polite">{pending ? "Atualizando o funil" : ""}</div>
      </div>
    </header>
  );
}
