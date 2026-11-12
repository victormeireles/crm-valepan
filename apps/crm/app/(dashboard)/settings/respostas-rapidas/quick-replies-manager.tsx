"use client";

import {
  createMessageTemplate,
  deleteMessageTemplate,
  moveMessageTemplate,
  updateMessageTemplate,
} from "@/app/actions/message-templates";
import { CrmIcon } from "@/components/crm-icon";
import {
  MESSAGE_TEMPLATE_BODY_MAX,
  MESSAGE_TEMPLATE_TITLE_MAX,
  type MessageTemplateDTO,
} from "@/lib/inbox/quick-replies";
import { invalidateActiveQuickRepliesCache } from "@/lib/inbox/quick-replies-cache";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";

export function QuickRepliesManager({
  initialTemplates,
  canManage,
}: {
  initialTemplates: MessageTemplateDTO[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialTemplates);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ordered = useMemo(
    () => [...items].sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title, "pt-BR")),
    [items],
  );

  async function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    const result = await action();
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    invalidateActiveQuickRepliesCache();
    router.refresh();
    return true;
  }

  function startEdit(item: MessageTemplateDTO) {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditBody(item.body);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle("");
    setEditBody("");
  }

  return (
    <section className="space-y-4">
      <div>
        <h1
          className="text-[40px] leading-none tracking-[0.01em] text-[var(--vp-wine)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Respostas rápidas
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--vp-ink-muted)]">
          Atalhos que aparecem acima do campo de mensagem no chat. Use{" "}
          <code className="rounded bg-[var(--vp-surface)] px-1.5 py-0.5 text-[12px] text-[var(--vp-wine)]">
            {"{{primeiro_nome}}"}
          </code>{" "}
          para inserir o nome do contato automaticamente.
        </p>
      </div>

      {canManage ? (
        <form
          className="space-y-3 rounded-[14px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const title = draftTitle.trim();
            const body = draftBody.trim();
            if (!title || !body || adding) return;
            setAdding(true);
            setError(null);
            void (async () => {
              const result = await createMessageTemplate({ title, body });
              setAdding(false);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setDraftTitle("");
              setDraftBody("");
              setItems((current) => [...current, result.template]);
              invalidateActiveQuickRepliesCache();
              router.refresh();
            })();
          }}
        >
          <p className="text-xs font-bold uppercase tracking-[0.06em] text-[var(--vp-ink-soft)]">Nova resposta</p>
          <label className="block space-y-1 text-xs font-bold uppercase tracking-[0.06em] text-[var(--vp-ink-soft)]">
            Título (chip no chat)
            <input
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              maxLength={MESSAGE_TEMPLATE_TITLE_MAX}
              placeholder="Ex.: Tabela de preços"
              className="mt-1 min-h-11 w-full rounded-[10px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-3 text-[13px] font-semibold normal-case tracking-normal text-[var(--vp-ink-body)] outline-none placeholder:text-[var(--vp-ink-soft)]"
            />
          </label>
          <label className="block space-y-1 text-xs font-bold uppercase tracking-[0.06em] text-[var(--vp-ink-soft)]">
            Texto da mensagem
            <textarea
              value={draftBody}
              onChange={(event) => setDraftBody(event.target.value)}
              maxLength={MESSAGE_TEMPLATE_BODY_MAX}
              rows={4}
              placeholder="Olá, {{primeiro_nome}}! …"
              className="mt-1 w-full resize-y rounded-[10px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-3 py-2.5 text-[13px] font-semibold normal-case tracking-normal text-[var(--vp-ink-body)] outline-none placeholder:text-[var(--vp-ink-soft)]"
            />
          </label>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={adding || !draftTitle.trim() || !draftBody.trim()}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-[var(--vp-wine)] px-4 text-[13px] font-bold text-[var(--vp-gold)] disabled:opacity-50"
            >
              <CrmIcon name="add" className="text-lg" />
              {adding ? "Adicionando…" : "Adicionar"}
            </button>
          </div>
        </form>
      ) : (
        <p className="rounded-[10px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-3 py-2.5 text-sm text-[var(--vp-ink-muted)]">
          Só administração e gestão podem alterar as respostas. Você continua usando os atalhos no chat.
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
            Nenhuma resposta rápida cadastrada.
          </li>
        ) : (
          ordered.map((item, index) => {
            const editing = editingId === item.id;
            return (
              <li
                key={item.id}
                className="border-b border-[var(--vp-ink-line)] px-3 py-3 last:border-b-0"
              >
                {editing ? (
                  <div className="space-y-3">
                    <label className="block space-y-1 text-xs font-bold uppercase tracking-[0.06em] text-[var(--vp-ink-soft)]">
                      Título
                      <input
                        value={editTitle}
                        onChange={(event) => setEditTitle(event.target.value)}
                        maxLength={MESSAGE_TEMPLATE_TITLE_MAX}
                        disabled={busyId === item.id}
                        className="mt-1 min-h-11 w-full rounded-[10px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-3 text-[13px] font-semibold normal-case tracking-normal text-[var(--vp-ink-body)] outline-none"
                      />
                    </label>
                    <label className="block space-y-1 text-xs font-bold uppercase tracking-[0.06em] text-[var(--vp-ink-soft)]">
                      Texto
                      <textarea
                        value={editBody}
                        onChange={(event) => setEditBody(event.target.value)}
                        maxLength={MESSAGE_TEMPLATE_BODY_MAX}
                        rows={4}
                        disabled={busyId === item.id}
                        className="mt-1 w-full resize-y rounded-[10px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-3 py-2.5 text-[13px] font-semibold normal-case tracking-normal text-[var(--vp-ink-body)] outline-none"
                      />
                    </label>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="min-h-11 cursor-pointer rounded-full bg-[var(--vp-wine)] px-4 text-[12px] font-bold text-[var(--vp-gold)] disabled:opacity-50"
                        disabled={busyId === item.id || !editTitle.trim() || !editBody.trim()}
                        onClick={() => {
                          setBusyId(item.id);
                          void run(() =>
                            updateMessageTemplate({
                              id: item.id,
                              title: editTitle,
                              body: editBody,
                            }),
                          ).then((ok) => {
                            setBusyId(null);
                            if (ok) {
                              setItems((current) =>
                                current.map((row) =>
                                  row.id === item.id
                                    ? {
                                        ...row,
                                        title: editTitle.trim().replace(/\s+/g, " "),
                                        body: editBody.replace(/\r\n/g, "\n").trim(),
                                      }
                                    : row,
                                ),
                              );
                              cancelEdit();
                            }
                          });
                        }}
                      >
                        Salvar
                      </button>
                      <button
                        type="button"
                        className="min-h-11 cursor-pointer rounded-lg px-3 text-[12px] font-bold text-[var(--vp-ink-muted)] hover:bg-[var(--vp-surface)]"
                        disabled={busyId === item.id}
                        onClick={cancelEdit}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <div className="flex min-w-0 flex-1 gap-2">
                      <span className="mt-1 w-6 shrink-0 text-center text-[11px] font-bold tabular-nums text-[var(--vp-ink-soft)]">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[13px] font-semibold text-[var(--vp-ink-body)]">{item.title}</p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em] ${
                              item.active
                                ? "bg-[rgba(35,0,4,0.06)] text-[var(--vp-wine)]"
                                : "bg-[var(--vp-surface)] text-[var(--vp-ink-soft)]"
                            }`}
                          >
                            {item.active ? "Ativa" : "Inativa"}
                          </span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--vp-ink-muted)]">
                          {item.body}
                        </p>
                      </div>
                    </div>
                    {canManage ? (
                      <div className="flex flex-wrap items-center gap-1 sm:justify-end">
                        <IconAction
                          label={`Subir ${item.title}`}
                          disabled={index === 0 || busyId === item.id}
                          onClick={() => {
                            setBusyId(item.id);
                            void run(() => moveMessageTemplate({ id: item.id, direction: "up" })).then((ok) => {
                              setBusyId(null);
                              if (ok) {
                                setItems((current) => {
                                  const next = [...current].sort(
                                    (a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title, "pt-BR"),
                                  );
                                  const at = next.findIndex((row) => row.id === item.id);
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
                          label={`Descer ${item.title}`}
                          disabled={index === ordered.length - 1 || busyId === item.id}
                          onClick={() => {
                            setBusyId(item.id);
                            void run(() => moveMessageTemplate({ id: item.id, direction: "down" })).then((ok) => {
                              setBusyId(null);
                              if (ok) {
                                setItems((current) => {
                                  const next = [...current].sort(
                                    (a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title, "pt-BR"),
                                  );
                                  const at = next.findIndex((row) => row.id === item.id);
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
                          disabled={busyId === item.id}
                          onClick={() => startEdit(item)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="min-h-11 cursor-pointer rounded-lg px-3 text-[12px] font-bold text-[var(--vp-wine)] hover:bg-[var(--vp-surface)] disabled:opacity-50"
                          disabled={busyId === item.id}
                          onClick={() => {
                            setBusyId(item.id);
                            void run(() =>
                              updateMessageTemplate({ id: item.id, active: !item.active }),
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
                            if (!window.confirm(`Excluir a resposta “${item.title}”?`)) return;
                            setBusyId(item.id);
                            void run(() => deleteMessageTemplate({ id: item.id })).then((ok) => {
                              setBusyId(null);
                              if (ok) setItems((current) => current.filter((row) => row.id !== item.id));
                            });
                          }}
                        >
                          Excluir
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
              </li>
            );
          })
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
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-11 cursor-pointer items-center justify-center rounded-lg text-[14px] font-bold text-[var(--vp-wine)] hover:bg-[var(--vp-surface)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}
