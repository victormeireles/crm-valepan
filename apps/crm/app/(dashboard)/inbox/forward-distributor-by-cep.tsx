"use client";

import {
  forwardConversationToDistributorByCep,
  listDistributorsByCep,
} from "@/app/actions/inbox";
import { CrmIcon } from "@/components/crm-icon";
import type { DistributorByCepOption } from "@/lib/distributor-catalog";
import { formatCaptureZip } from "@/lib/lead-capture";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function formatCepRange(de: string, ate: string): string {
  return `${formatCaptureZip(de)} – ${formatCaptureZip(ate)}`;
}

export function ForwardDistributorByCepButton({
  conversationId,
  leadId,
  initialZipCode,
  onAssigned,
  appearance = "toolbar",
}: {
  conversationId: string;
  leadId: string;
  initialZipCode: string | null;
  appearance?: "toolbar" | "strip" | "outline";
  onAssigned?: (next: {
    stageId: string;
    substage: string;
    distributorId: string;
    distributorName: string;
    zipCode: string;
  }) => void;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [zipCode, setZipCode] = useState(formatCaptureZip(initialZipCode ?? ""));
  const [options, setOptions] = useState<DistributorByCepOption[]>([]);
  const [searchedCep, setSearchedCep] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    setZipCode(formatCaptureZip(initialZipCode ?? ""));
    setOptions([]);
    setSearchedCep(null);
    setError(null);
    setInfo(null);
    setOpen(false);
  }, [conversationId, leadId, initialZipCode]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const digits = zipCode.replace(/\D/g, "");
    if (digits.length === 8) {
      void runSearch(digits);
    }
    // Busca automática só na abertura com CEP do lead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function runSearch(rawCep?: string) {
    const cep = (rawCep ?? zipCode).replace(/\D/g, "");
    setLoading(true);
    setError(null);
    setInfo(null);
    setOptions([]);
    setSearchedCep(null);
    try {
      const result = await listDistributorsByCep({ cep });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSearchedCep(result.cep);
      setZipCode(formatCaptureZip(result.cep));
      setOptions(result.options);
      if (result.options.length === 0) {
        setInfo("Nenhum distribuidor atende este CEP.");
      }
    } catch {
      setError("Não foi possível buscar distribuidores. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function assign(option: DistributorByCepOption) {
    if (!searchedCep) {
      setError("Busque o CEP antes de selecionar.");
      return;
    }
    setAssigningId(option.id);
    setError(null);
    try {
      const result = await forwardConversationToDistributorByCep({
        conversationId,
        distributorId: option.id,
        cep: searchedCep,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onAssigned?.({
        stageId: result.stageId,
        substage: result.substage,
        distributorId: result.distributorId,
        distributorName: result.distributorName,
        zipCode: result.zipCode,
      });
      setOpen(false);
      router.refresh();
    } catch {
      setError("Não foi possível encaminhar. Tente novamente.");
    } finally {
      setAssigningId(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          appearance === "strip"
            ? "flex h-12 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] text-[var(--vp-wine)]"
            : appearance === "outline"
              ? "inline-flex h-[52px] min-w-0 flex-1 items-center justify-center rounded-xl border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-3 text-sm font-bold text-[var(--vp-wine)]"
              : "inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-3 text-xs font-bold text-[var(--vp-wine)] hover:bg-[var(--vp-surface)]"
        }
        title="Buscar distribuidor por CEP"
      >
        {appearance === "outline" ? (
          "Distribuidor por CEP"
        ) : (
          <>
            <CrmIcon name="search" className={appearance === "strip" ? "text-[18px]" : "text-base"} />
            {appearance === "strip" ? (
              <span className="text-[10px] font-extrabold">CEP</span>
            ) : (
              <span className="hidden sm:inline">CEP</span>
            )}
          </>
        )}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="forward-distributor-cep-title"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
        className="m-auto w-[min(96vw,440px)] max-w-none overflow-hidden rounded-2xl border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] p-0 text-[var(--vp-ink-body)] shadow-[var(--sh-lg)] backdrop:bg-black/50"
      >
        <div className="flex max-h-[min(86dvh,640px)] flex-col">
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--vp-ink-line)] px-4 py-3">
            <div className="min-w-0">
              <h2 id="forward-distributor-cep-title" className="text-sm font-bold">
                Distribuidor por CEP
              </h2>
              <p className="mt-0.5 text-xs text-[var(--vp-ink-muted)]">
                Selecione para marcar Negociação → Encaminhado para o distribuidor.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid size-8 place-items-center rounded-full text-[var(--vp-ink-muted)] hover:bg-[var(--vp-surface)]"
              aria-label="Fechar"
            >
              <CrmIcon name="close" className="text-lg" />
            </button>
          </header>

          <div className="shrink-0 space-y-2 border-b border-[var(--vp-ink-line)] px-4 py-3">
            <label className="block text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--vp-ink-muted)]">
              CEP
            </label>
            <div className="flex gap-2">
              <input
                value={zipCode}
                onChange={(event) => setZipCode(formatCaptureZip(event.target.value))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void runSearch();
                  }
                }}
                inputMode="numeric"
                placeholder="00000-000"
                className="min-w-0 flex-1 rounded-xl border border-[var(--vp-ink-line)] bg-[var(--vp-paper)] px-3 py-2 text-sm font-semibold outline-none focus:border-[var(--vp-wine)]"
              />
              <button
                type="button"
                disabled={loading}
                onClick={() => void runSearch()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--vp-wine)] px-3 py-2 text-xs font-bold text-[var(--vp-gold)] disabled:opacity-60"
              >
                <CrmIcon name="search" className="text-base" />
                {loading ? "Buscando…" : "Buscar"}
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {error ? (
              <p role="alert" className="mx-2 my-2 rounded-lg bg-[var(--vp-error-container)] px-3 py-2 text-xs text-[var(--vp-error)]">
                {error}
              </p>
            ) : null}
            {info ? (
              <p className="mx-2 my-2 px-2 py-6 text-center text-sm text-[var(--vp-ink-muted)]">{info}</p>
            ) : null}
            {!loading && !info && options.length === 0 && !error ? (
              <p className="mx-2 my-2 px-2 py-6 text-center text-sm text-[var(--vp-ink-muted)]">
                Informe o CEP e busque os distribuidores da região.
              </p>
            ) : null}
            <ul className="space-y-1">
              {options.map((option, index) => (
                <li key={option.id}>
                  <button
                    type="button"
                    disabled={assigningId != null}
                    onClick={() => void assign(option)}
                    className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[var(--vp-surface)] disabled:opacity-60"
                  >
                    <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-[var(--vp-surface-high)] text-[11px] font-extrabold text-[var(--vp-wine)]">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-[var(--vp-ink-body)]">
                        {option.name}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-[var(--vp-ink-muted)]">
                        Prioridade {option.cepPrioridade ?? "—"} · faixa{" "}
                        {formatCepRange(option.cepDe, option.cepAte)}
                      </span>
                    </span>
                    <span className="shrink-0 pt-0.5 text-[11px] font-bold text-[var(--vp-wine)]">
                      {assigningId === option.id ? "Salvando…" : "Selecionar"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </dialog>
    </>
  );
}
