"use client";

import {
  createDistributorRecord,
  deleteDistributorRecord,
  updateDistributorRecord,
} from "@/app/actions/distributors";
import { CrmIcon } from "@/components/crm-icon";
import { compareDistributors, DISTRIBUTOR_NAME_MAX, type DistributorDTO } from "@/lib/distributors";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export function DistributorsManager({
  initialDistributors,
  canManage,
}: {
  initialDistributors: DistributorDTO[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialDistributors);
  const [draftName, setDraftName] = useState("");
  const [draftState, setDraftState] = useState("");
  const [draftCity, setDraftCity] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ordered = useMemo(() => [...items].sort(compareDistributors), [items]);

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
          Distribuidores
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--vp-ink-muted)]">
          Estes nomes aparecem quando um lead é encaminhado para o distribuidor.
          Inclua, renomeie ou desative aqui.{" "}
          <Link href="/settings/subetapas" className="font-semibold text-[var(--vp-wine)] underline-offset-2 hover:underline">
            Subetapas
          </Link>
        </p>
      </div>

      {canManage ? (
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            const name = draftName.trim();
            if (!name || adding) return;
            setAdding(true);
            setError(null);
            void (async () => {
              const result = await createDistributorRecord({
                name,
                state: draftState,
                city: draftCity,
              });
              setAdding(false);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setDraftName("");
              setDraftState("");
              setDraftCity("");
              setItems((current) => [...current, result.distributor]);
              router.refresh();
            })();
          }}
        >
          <label className="w-20 space-y-1 text-xs font-bold uppercase tracking-[0.06em] text-[var(--vp-ink-soft)]">
            Estado
            <input
              value={draftState}
              onChange={(event) => setDraftState(event.target.value.toUpperCase().slice(0, 2))}
              maxLength={2}
              placeholder="SP"
              className="mt-1 min-h-11 w-full rounded-[10px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-3 text-[13px] font-semibold normal-case tracking-normal text-[var(--vp-ink-body)] outline-none placeholder:text-[var(--vp-ink-soft)]"
            />
          </label>
          <label className="min-w-0 flex-1 space-y-1 text-xs font-bold uppercase tracking-[0.06em] text-[var(--vp-ink-soft)]">
            Cidade
            <input
              value={draftCity}
              onChange={(event) => setDraftCity(event.target.value)}
              maxLength={80}
              placeholder="São Paulo"
              className="mt-1 min-h-11 w-full rounded-[10px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-3 text-[13px] font-semibold normal-case tracking-normal text-[var(--vp-ink-body)] outline-none placeholder:text-[var(--vp-ink-soft)]"
            />
          </label>
          <label className="min-w-0 flex-[1.4] space-y-1 text-xs font-bold uppercase tracking-[0.06em] text-[var(--vp-ink-soft)]">
            Distribuidor
            <input
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              maxLength={DISTRIBUTOR_NAME_MAX}
              placeholder="Ex.: Cachinhos Dourados"
              className="mt-1 min-h-11 w-full rounded-[10px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-3 text-[13px] font-semibold normal-case tracking-normal text-[var(--vp-ink-body)] outline-none placeholder:text-[var(--vp-ink-soft)]"
            />
          </label>
          <button
            type="submit"
            disabled={adding || !draftName.trim()}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-[var(--vp-wine)] px-4 text-[13px] font-bold text-[var(--vp-gold)] disabled:opacity-50"
          >
            <CrmIcon name="add" className="text-lg" />
            {adding ? "Adicionando…" : "Adicionar"}
          </button>
        </form>
      ) : (
        <p className="rounded-[10px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-3 py-2.5 text-sm text-[var(--vp-ink-muted)]">
          Só administração e gestão podem alterar a lista. Você continua escolhendo o distribuidor no chat.
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
            Nenhum distribuidor cadastrado.
          </li>
        ) : (
          ordered.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-2 border-b border-[var(--vp-ink-line)] px-3 py-2.5 last:border-b-0 sm:flex-row sm:items-center"
            >
              <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2">
                <span className="w-8 shrink-0 text-[12px] font-bold text-[var(--vp-ink-soft)]">
                  {item.state ?? "—"}
                </span>
                <span className="w-40 shrink-0 truncate text-[13px] text-[var(--vp-ink-body)]">
                  {item.city ?? "Sem cidade"}
                </span>
                {canManage ? (
                  <input
                    aria-label={`Nome do distribuidor ${item.name}`}
                    defaultValue={item.name}
                    maxLength={DISTRIBUTOR_NAME_MAX}
                    disabled={busyId === item.id}
                    className="min-h-11 min-w-0 flex-1 rounded-[10px] border border-transparent bg-transparent px-2 text-[13px] font-semibold text-[var(--vp-ink-body)] outline-none hover:border-[var(--vp-ink-line)] focus:border-[var(--vp-wine)]"
                    onBlur={(event) => {
                      const next = event.currentTarget.value.trim();
                      if (!next || next.toUpperCase() === item.name.toUpperCase()) {
                        event.currentTarget.value = item.name;
                        return;
                      }
                      setBusyId(item.id);
                      void run(() => updateDistributorRecord({ id: item.id, name: next })).then((ok) => {
                        setBusyId(null);
                        if (ok) {
                          const saved = next.replace(/\s+/g, " ").toUpperCase();
                          setItems((current) =>
                            current.map((row) => (row.id === item.id ? { ...row, name: saved } : row)),
                          );
                          event.currentTarget.value = saved;
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
                  <button
                    type="button"
                    className="min-h-11 cursor-pointer rounded-lg px-3 text-[12px] font-bold text-[var(--vp-wine)] hover:bg-[var(--vp-surface)] disabled:opacity-50"
                    disabled={busyId === item.id}
                    onClick={() => {
                      setBusyId(item.id);
                      void run(() => updateDistributorRecord({ id: item.id, active: !item.active })).then((ok) => {
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
                      if (
                        !window.confirm(
                          `Excluir “${item.name}”? Leads já encaminhados perdem o vínculo. Se o nome já foi usado, desative.`,
                        )
                      ) {
                        return;
                      }
                      setBusyId(item.id);
                      void run(() => deleteDistributorRecord({ id: item.id })).then((ok) => {
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
