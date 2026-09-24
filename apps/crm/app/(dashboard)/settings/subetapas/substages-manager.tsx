"use client";

import {
  createPipelineSubstage,
  deletePipelineSubstage,
  movePipelineSubstage,
  updatePipelineSubstage,
} from "@/app/actions/lost-reasons";
import { CrmIcon } from "@/components/crm-icon";
import {
  CANONICAL_PIPELINE_STAGE_NAMES,
  displayPipelineStageName,
  type CanonicalPipelineStageName,
} from "@/lib/pipeline-canonical-stages";
import type { PipelineSubstageDTO } from "@/lib/pipeline-substages";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export function SubstagesManager({
  initialSubstages,
  canManage,
}: {
  initialSubstages: PipelineSubstageDTO[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialSubstages);
  const [activeStage, setActiveStage] = useState<CanonicalPipelineStageName>("NEGOCIAÇÃO");
  const [draft, setDraft] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ordered = useMemo(
    () =>
      items
        .filter((item) => item.stage_key === activeStage)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "pt-BR")),
    [items, activeStage],
  );

  async function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    const result = await action();
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    router.refresh();
    return true;
  }

  return (
    <section className="space-y-4">
      <div>
        <h1
          className="text-[40px] leading-none tracking-[0.01em] text-[var(--vp-wine)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Subetapas
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--vp-ink-muted)]">
          Cada etapa do funil tem os próprios status. No chat, primeiro escolhe a etapa
          (Novo, Qualificação, Negociação, Encaminhado para distribuidor, Cliente, Perdido)
          e depois o status desta lista.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CANONICAL_PIPELINE_STAGE_NAMES.map((stageKey) => {
          const count = items.filter((item) => item.stage_key === stageKey && item.active).length;
          const selected = activeStage === stageKey;
          return (
            <button
              key={stageKey}
              type="button"
              onClick={() => setActiveStage(stageKey)}
              className={`min-h-11 cursor-pointer rounded-full px-3 text-[13px] font-bold ${
                selected
                  ? "bg-[var(--vp-wine)] text-[var(--vp-gold)]"
                  : "border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] text-[var(--vp-wine)]"
              }`}
            >
              {displayPipelineStageName(stageKey)}
              <span className="ml-1.5 tabular-nums opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {canManage ? (
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            const name = draft.trim();
            if (!name || adding) return;
            setAdding(true);
            setError(null);
            void (async () => {
              const result = await createPipelineSubstage({ name, stageKey: activeStage });
              setAdding(false);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setDraft("");
              setItems((current) => [...current, result.substage]);
              router.refresh();
            })();
          }}
        >
          <label className="min-w-0 flex-1 space-y-1 text-xs font-bold uppercase tracking-[0.06em] text-[var(--vp-ink-soft)]">
            Novo status em {displayPipelineStageName(activeStage)}
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={80}
              placeholder={
                activeStage === "NEGOCIAÇÃO"
                  ? "Ex.: Pediu amostra"
                  : activeStage === "PERDIDO"
                    ? "Ex.: Não inaugurou"
                    : "Ex.: Sem retorno"
              }
              className="mt-1 min-h-11 w-full rounded-[10px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-3 text-[13px] font-semibold normal-case tracking-normal text-[var(--vp-ink-body)] outline-none placeholder:text-[var(--vp-ink-soft)]"
            />
          </label>
          <button
            type="submit"
            disabled={adding || !draft.trim()}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-[var(--vp-wine)] px-4 text-[13px] font-bold text-[var(--vp-gold)] disabled:opacity-50"
          >
            <CrmIcon name="add" className="text-lg" />
            {adding ? "Adicionando…" : "Adicionar"}
          </button>
        </form>
      ) : (
        <p className="rounded-[10px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-3 py-2.5 text-sm text-[var(--vp-ink-muted)]">
          Só administração e gestão podem alterar a lista. Você continua vendo os status no chat e no funil.
        </p>
      )}

      {error ? (
        <p role="alert" className="text-sm text-[var(--vp-error)]">
          {error}
        </p>
      ) : null}

      <ul className="overflow-hidden rounded-[14px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)]">
        {ordered.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-[var(--vp-ink-muted)]">
            Nenhum status cadastrado para {displayPipelineStageName(activeStage)}.
          </li>
        ) : (
          ordered.map((item, index) => (
            <li
              key={item.id}
              className="flex flex-col gap-2 border-b border-[var(--vp-ink-line)] px-3 py-2.5 last:border-b-0 sm:flex-row sm:items-center"
            >
              <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2">
                <span className="w-6 shrink-0 text-center text-[11px] font-bold tabular-nums text-[var(--vp-ink-soft)]">
                  {index + 1}
                </span>
                {canManage ? (
                  <input
                    aria-label={`Nome do status ${item.name}`}
                    defaultValue={item.name}
                    maxLength={80}
                    disabled={busyId === item.id}
                    className="min-h-11 min-w-0 flex-1 rounded-[10px] border border-transparent bg-transparent px-2 text-[13px] font-semibold text-[var(--vp-ink-body)] outline-none hover:border-[var(--vp-ink-line)] focus:border-[var(--vp-wine)]"
                    onBlur={(event) => {
                      const next = event.currentTarget.value.trim();
                      if (!next || next === item.name) {
                        event.currentTarget.value = item.name;
                        return;
                      }
                      setBusyId(item.id);
                      void run(() => updatePipelineSubstage({ id: item.id, name: next })).then((ok) => {
                        setBusyId(null);
                        if (ok) {
                          setItems((current) =>
                            current.map((row) => (row.id === item.id ? { ...row, name: next } : row)),
                          );
                        } else {
                          event.currentTarget.value = item.name;
                        }
                      });
                    }}
                  />
                ) : (
                  <span className="text-[13px] font-semibold text-[var(--vp-ink-body)]">{item.name}</span>
                )}
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em] ${
                    item.active
                      ? "bg-[rgba(35,0,4,0.06)] text-[var(--vp-wine)]"
                      : "bg-[var(--vp-surface)] text-[var(--vp-ink-soft)]"
                  }`}
                >
                  {item.active ? "Ativo" : "Inativo"}
                </span>
              </div>
              {canManage ? (
                <div className="flex flex-wrap items-center gap-1 sm:justify-end">
                  <IconAction
                    label={`Subir ${item.name}`}
                    disabled={index === 0 || busyId === item.id}
                    onClick={() => {
                      setBusyId(item.id);
                      void run(() => movePipelineSubstage({ id: item.id, direction: "up" })).then((ok) => {
                        setBusyId(null);
                        if (ok) {
                          setItems((current) => {
                            const next = [...current]
                              .filter((row) => row.stage_key === activeStage)
                              .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "pt-BR"));
                            const at = next.findIndex((row) => row.id === item.id);
                            if (at <= 0) return current;
                            const swap = next[at - 1]!;
                            const currentItem = next[at]!;
                            const currentOrder = currentItem.sort_order;
                            currentItem.sort_order = swap.sort_order;
                            swap.sort_order = currentOrder;
                            const others = current.filter((row) => row.stage_key !== activeStage);
                            return [...others, ...next];
                          });
                        }
                      });
                    }}
                  >
                    ↑
                  </IconAction>
                  <IconAction
                    label={`Descer ${item.name}`}
                    disabled={index === ordered.length - 1 || busyId === item.id}
                    onClick={() => {
                      setBusyId(item.id);
                      void run(() => movePipelineSubstage({ id: item.id, direction: "down" })).then((ok) => {
                        setBusyId(null);
                        if (ok) {
                          setItems((current) => {
                            const next = [...current]
                              .filter((row) => row.stage_key === activeStage)
                              .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "pt-BR"));
                            const at = next.findIndex((row) => row.id === item.id);
                            if (at < 0 || at >= next.length - 1) return current;
                            const swap = next[at + 1]!;
                            const currentItem = next[at]!;
                            const currentOrder = currentItem.sort_order;
                            currentItem.sort_order = swap.sort_order;
                            swap.sort_order = currentOrder;
                            const others = current.filter((row) => row.stage_key !== activeStage);
                            return [...others, ...next];
                          });
                        }
                      });
                    }}
                  >
                    ↓
                  </IconAction>
                  <button
                    type="button"
                    className="min-h-11 cursor-pointer rounded-lg px-3 text-[12px] font-bold text-[var(--vp-wine)] hover:bg-[var(--vp-surface)] disabled:opacity-50"
                    disabled={busyId === item.id}
                    onClick={() => {
                      setBusyId(item.id);
                      void run(() =>
                        updatePipelineSubstage({ id: item.id, active: !item.active }),
                      ).then((ok) => {
                        setBusyId(null);
                        if (ok) {
                          setItems((current) =>
                            current.map((row) =>
                              row.id === item.id ? { ...row, active: !row.active } : row,
                            ),
                          );
                        }
                      });
                    }}
                  >
                    {item.active ? "Desativar" : "Ativar"}
                  </button>
                  <button
                    type="button"
                    className="min-h-11 cursor-pointer rounded-lg px-3 text-[12px] font-bold text-[var(--vp-error)] hover:bg-[var(--vp-surface)] disabled:opacity-50"
                    disabled={busyId === item.id}
                    onClick={() => {
                      if (!window.confirm(`Excluir o status “${item.name}”? Se já foi usado, desative em vez de excluir.`)) {
                        return;
                      }
                      setBusyId(item.id);
                      void run(() => deletePipelineSubstage({ id: item.id })).then((ok) => {
                        setBusyId(null);
                        if (ok) setItems((current) => current.filter((row) => row.id !== item.id));
                      });
                    }}
                  >
                    Excluir
                  </button>
                </div>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

function IconAction({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-11 cursor-pointer place-items-center rounded-lg border border-[var(--vp-ink-line)] bg-[var(--vp-surface)] text-sm font-bold text-[var(--vp-wine)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}
