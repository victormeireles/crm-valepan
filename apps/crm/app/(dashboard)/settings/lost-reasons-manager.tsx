"use client";

import {
  createLostReason,
  deleteLostReason,
  moveLostReason,
  updateLostReason,
} from "@/app/actions/lost-reasons";
import { CrmIcon } from "@/components/crm-icon";
import type { LostReasonDTO } from "@/lib/lost-reasons";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export function LostReasonsManager({
  initialReasons,
  canManage,
}: {
  initialReasons: LostReasonDTO[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [reasons, setReasons] = useState(initialReasons);
  const [draft, setDraft] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ordered = useMemo(
    () => [...reasons].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "pt-BR")),
    [reasons],
  );

  async function run(label: string, action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
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
        <h2 className="text-base font-bold text-[var(--vp-wine)]">Motivos de perda</h2>
        <p className="mt-1 max-w-2xl text-sm text-[var(--vp-ink-muted)]">
          Estes nomes aparecem ao encerrar uma oportunidade. Inclua, renomeie ou desative
          aqui — não precisa de alteração de código.
        </p>
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
              const result = await createLostReason({ name });
              setAdding(false);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setDraft("");
              setReasons((current) => [...current, result.reason]);
              router.refresh();
            })();
          }}
        >
          <label className="min-w-0 flex-1 space-y-1 text-xs font-bold uppercase tracking-[0.06em] text-[var(--vp-ink-soft)]">
            Novo motivo
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={80}
              placeholder="Ex.: Não inaugurou"
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
          Só administração e gestão podem alterar a lista. Você continua vendo os motivos ativos no funil.
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
            Nenhum motivo cadastrado ainda.
          </li>
        ) : (
          ordered.map((reason, index) => (
            <li
              key={reason.id}
              className="flex flex-col gap-2 border-b border-[var(--vp-ink-line)] px-3 py-2.5 last:border-b-0 sm:flex-row sm:items-center"
            >
              <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2">
                <span className="w-6 shrink-0 text-center text-[11px] font-bold tabular-nums text-[var(--vp-ink-soft)]">
                  {index + 1}
                </span>
                {canManage ? (
                  <input
                    aria-label={`Nome do motivo ${reason.name}`}
                    defaultValue={reason.name}
                    maxLength={80}
                    disabled={busyId === reason.id}
                    className="min-h-11 min-w-0 flex-1 rounded-[10px] border border-transparent bg-transparent px-2 text-[13px] font-semibold text-[var(--vp-ink-body)] outline-none hover:border-[var(--vp-ink-line)] focus:border-[var(--vp-wine)]"
                    onBlur={(event) => {
                      const next = event.currentTarget.value.trim();
                      if (!next || next === reason.name) {
                        event.currentTarget.value = reason.name;
                        return;
                      }
                      setBusyId(reason.id);
                      void run("rename", () => updateLostReason({ id: reason.id, name: next })).then((ok) => {
                        setBusyId(null);
                        if (ok) {
                          setReasons((current) =>
                            current.map((item) => (item.id === reason.id ? { ...item, name: next } : item)),
                          );
                        } else {
                          event.currentTarget.value = reason.name;
                        }
                      });
                    }}
                  />
                ) : (
                  <span className="text-[13px] font-semibold text-[var(--vp-ink-body)]">{reason.name}</span>
                )}
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em] ${
                    reason.active
                      ? "bg-[rgba(35,0,4,0.06)] text-[var(--vp-wine)]"
                      : "bg-[var(--vp-surface)] text-[var(--vp-ink-soft)]"
                  }`}
                >
                  {reason.active ? "Ativo" : "Inativo"}
                </span>
              </div>
              {canManage ? (
                <div className="flex flex-wrap items-center gap-1 sm:justify-end">
                  <IconAction
                    label={`Subir ${reason.name}`}
                    disabled={index === 0 || busyId === reason.id}
                    onClick={() => {
                      setBusyId(reason.id);
                      void run("move", () => moveLostReason({ id: reason.id, direction: "up" })).then((ok) => {
                        setBusyId(null);
                        if (ok) {
                          setReasons((current) => {
                            const next = [...current].sort(
                              (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "pt-BR"),
                            );
                            const at = next.findIndex((item) => item.id === reason.id);
                            if (at <= 0) return current;
                            const swap = next[at - 1]!;
                            const currentItem = next[at]!;
                            const currentOrder = currentItem.sort_order;
                            currentItem.sort_order = swap.sort_order;
                            swap.sort_order = currentOrder;
                            return next;
                          });
                        }
                      });
                    }}
                  >
                    ↑
                  </IconAction>
                  <IconAction
                    label={`Descer ${reason.name}`}
                    disabled={index === ordered.length - 1 || busyId === reason.id}
                    onClick={() => {
                      setBusyId(reason.id);
                      void run("move", () => moveLostReason({ id: reason.id, direction: "down" })).then((ok) => {
                        setBusyId(null);
                        if (ok) {
                          setReasons((current) => {
                            const next = [...current].sort(
                              (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "pt-BR"),
                            );
                            const at = next.findIndex((item) => item.id === reason.id);
                            if (at < 0 || at >= next.length - 1) return current;
                            const swap = next[at + 1]!;
                            const currentItem = next[at]!;
                            const currentOrder = currentItem.sort_order;
                            currentItem.sort_order = swap.sort_order;
                            swap.sort_order = currentOrder;
                            return next;
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
                    disabled={busyId === reason.id}
                    onClick={() => {
                      setBusyId(reason.id);
                      void run("toggle", () =>
                        updateLostReason({ id: reason.id, active: !reason.active }),
                      ).then((ok) => {
                        setBusyId(null);
                        if (ok) {
                          setReasons((current) =>
                            current.map((item) =>
                              item.id === reason.id ? { ...item, active: !item.active } : item,
                            ),
                          );
                        }
                      });
                    }}
                  >
                    {reason.active ? "Desativar" : "Ativar"}
                  </button>
                  <button
                    type="button"
                    className="min-h-11 cursor-pointer rounded-lg px-3 text-[12px] font-bold text-[var(--vp-error)] hover:bg-[var(--vp-surface)] disabled:opacity-50"
                    disabled={busyId === reason.id}
                    onClick={() => {
                      if (!window.confirm(`Excluir o motivo “${reason.name}”? Se já foi usado, desative em vez de excluir.`)) {
                        return;
                      }
                      setBusyId(reason.id);
                      void run("delete", () => deleteLostReason({ id: reason.id })).then((ok) => {
                        setBusyId(null);
                        if (ok) setReasons((current) => current.filter((item) => item.id !== reason.id));
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
