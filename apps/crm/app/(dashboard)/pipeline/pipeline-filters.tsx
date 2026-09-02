"use client";

import type { PipelinePageFilters, PipelineVolumeFilter } from "@/app/actions/pipeline";
import type { ClientCategoryValue } from "@/lib/client-categories";
import { PIPELINE_STALE_DAYS, type PipelineRegion } from "@/lib/pipeline-signals";
import type { PipelineStageDTO } from "./pipeline-board";

type TeamOption = { id: string; label: string; count: number };

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "Sem nome";
}

export function PipelineHeader({
  visibleCount,
  volumeKg,
  totalCount,
  teamOptions,
  mineCount,
  canViewTeam,
  currentUserId,
  filters,
  pending,
  onFilterChange,
}: {
  visibleCount: number;
  volumeKg: number;
  totalCount: number;
  teamOptions: TeamOption[];
  mineCount: number;
  canViewTeam: boolean;
  currentUserId: string | null;
  filters: PipelinePageFilters;
  pending: boolean;
  onFilterChange: (patch: Record<string, string | null>) => void;
}) {
  const number = new Intl.NumberFormat("pt-BR");

  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1
          className="text-[40px] leading-none tracking-[0.01em] text-[var(--vp-wine)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Funil comercial
        </h1>
        <p className="mt-1.5 text-[13px] text-[var(--vp-ink-muted)]" aria-live="polite">
          {number.format(visibleCount)} oportunidades abertas · {number.format(volumeKg)} kg/semana em jogo · {pending ? "atualizando…" : "atualizado agora"}
        </p>
      </div>

      {canViewTeam ? (
        <section className="min-w-0" aria-label="Funil por vendedor">
          <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--vp-ink-soft)] lg:text-right">
            Vendedor
          </div>
          <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Selecionar vendedor">
            <button
              type="button"
              className={`min-h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-bold ${
                !filters.ownerUserId
                  ? "border-[var(--vp-wine)] bg-[var(--vp-wine)] text-[var(--vp-gold)]"
                  : "border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] text-[var(--vp-ink-body)]"
              }`}
              aria-pressed={!filters.ownerUserId}
              onClick={() => onFilterChange({ mine: null, owner: null })}
            >
              Todos <span className="ml-1 opacity-70">{number.format(totalCount)}</span>
            </button>
            {currentUserId ? (
              <button
                type="button"
                className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-[13px] ${
                  filters.ownerUserId === currentUserId
                    ? "border-[var(--vp-wine)] bg-[var(--vp-wine)] font-bold text-[var(--vp-gold)]"
                    : "border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] text-[var(--vp-ink-body)]"
                }`}
                aria-pressed={filters.ownerUserId === currentUserId}
                onClick={() => onFilterChange({ mine: "1", owner: null })}
              >
                <span className="grid size-[22px] place-items-center rounded-full bg-[var(--vp-gold)] text-[10px] font-extrabold text-[var(--vp-wine)]">EU</span>
                Meus <span className="text-[var(--vp-ink-soft)]">{number.format(mineCount)}</span>
              </button>
            ) : null}
            {teamOptions.filter((option) => option.id !== currentUserId).map((option) => {
              const selected = filters.ownerUserId === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-[13px] ${
                    selected
                      ? "border-[var(--vp-wine)] bg-[var(--vp-wine)] font-bold text-[var(--vp-gold)]"
                      : "border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] text-[var(--vp-ink-body)]"
                  }`}
                  aria-pressed={selected}
                  onClick={() => onFilterChange({ mine: null, owner: option.id })}
                >
                  <span className="grid size-[22px] place-items-center rounded-full bg-[var(--vp-gold)] text-[10px] font-extrabold text-[var(--vp-wine)]">
                    {initials(option.label) || "?"}
                  </span>
                  {firstName(option.label)} <span className={selected ? "opacity-70" : "text-[var(--vp-ink-soft)]"}>{number.format(option.count)}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
    </header>
  );
}

function FilterMenu({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <details className="group relative shrink-0">
      <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-full border border-dotted border-[rgba(35,0,4,0.35)] px-3 text-xs font-semibold text-[var(--vp-ink-muted)] marker:content-none [&::-webkit-details-marker]:hidden">
        {label}
        <span className="material-symbols-outlined text-[14px] transition-transform group-open:rotate-180" aria-hidden="true">expand_more</span>
      </summary>
      <div className="absolute left-0 z-40 mt-1 min-w-52 overflow-hidden rounded-xl border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] py-1 shadow-[var(--sh-md)]">
        {options.map((option) => (
          <button
            key={option.value || "all"}
            type="button"
            className={`flex min-h-10 w-full items-center justify-between px-3 text-left text-xs hover:bg-[var(--vp-surface)] ${value === option.value ? "font-bold text-[var(--vp-wine)]" : "text-[var(--vp-ink-muted)]"}`}
            onClick={(event) => {
              onChange(option.value);
              event.currentTarget.closest("details")?.removeAttribute("open");
            }}
          >
            {option.label}
            {value === option.value ? <span className="material-symbols-outlined text-base" aria-hidden="true">check</span> : null}
          </button>
        ))}
      </div>
    </details>
  );
}

export function PipelineFilters({
  stages,
  filters,
  hasAnyFilter,
  onFilterChange,
}: {
  stages: PipelineStageDTO[];
  filters: PipelinePageFilters;
  hasAnyFilter: boolean;
  onFilterChange: (patch: Record<string, string | null>) => void;
}) {
  const selectedStage = stages.find((stage) => stage.id === filters.stageId);
  const regionLabels: Record<PipelineRegion, string> = { sp: "São Paulo", rj: "Rio de Janeiro" };
  const categoryLabels: Record<ClientCategoryValue, string> = {
    hamburgueria: "Hamburgueria",
    distribuidor: "Distribuidor",
    parceiros: "Parceiros",
    outros: "Outros",
  };
  const volumeLabels: Record<Exclude<PipelineVolumeFilter, null>, string> = {
    informado: "informado",
    ate_100: "até 100 kg/sem",
    acima_100: "acima de 100 kg/sem",
  };

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--vp-ink-soft)]">Filtros</span>
      <FilterMenu
        label={`Região: ${filters.region ? regionLabels[filters.region] : "todas"}`}
        value={filters.region ?? ""}
        options={[{ value: "", label: "Todas" }, { value: "sp", label: "São Paulo (DDD 11)" }, { value: "rj", label: "Rio de Janeiro (DDD 21)" }]}
        onChange={(value) => onFilterChange({ region: value || null })}
      />
      <FilterMenu
        label={`Tipo de cliente: ${filters.clientCategory ? categoryLabels[filters.clientCategory].toLocaleLowerCase("pt-BR") : "todos"}`}
        value={filters.clientCategory ?? ""}
        options={[{ value: "", label: "Todos" }, ...Object.entries(categoryLabels).map(([value, label]) => ({ value, label }))]}
        onChange={(value) => onFilterChange({ client_category: value || null })}
      />
      <FilterMenu
        label={`Etapa: ${selectedStage?.name.toLocaleLowerCase("pt-BR") ?? "abertas"}`}
        value={filters.stageId ?? ""}
        options={[{ value: "", label: "Todas as abertas" }, ...stages.filter((stage) => !stage.is_final).map((stage) => ({ value: stage.id, label: stage.name }))]}
        onChange={(value) => onFilterChange({ stage: value || null })}
      />
      <FilterMenu
        label={`Volume: ${filters.volume ? volumeLabels[filters.volume] : "qualquer"}`}
        value={filters.volume ?? ""}
        options={[{ value: "", label: "Qualquer volume" }, { value: "informado", label: "Volume informado" }, { value: "ate_100", label: "Até 100 kg/sem" }, { value: "acima_100", label: "Acima de 100 kg/sem" }]}
        onChange={(value) => onFilterChange({ volume: value || null })}
      />
      {hasAnyFilter ? (
        <button type="button" className="min-h-9 text-xs font-semibold text-[var(--vp-wine)] hover:underline" onClick={() => onFilterChange({ mine: null, owner: null, signal: null, region: null, client_category: null, stage: null, volume: null, q: null })}>
          Limpar filtros
        </button>
      ) : null}
      <p className="ml-auto text-[11px] text-[var(--vp-ink-soft)]">
        Sinais: resposta pendente, follow-up vencido e oportunidade parada há {PIPELINE_STALE_DAYS}+ dias · arraste para mudar de etapa
      </p>
    </div>
  );
}
