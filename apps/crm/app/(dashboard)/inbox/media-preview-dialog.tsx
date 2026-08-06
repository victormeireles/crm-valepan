"use client";

import { useEffect, useRef, useState } from "react";

export function MediaPreviewDialog({
  src,
  fileName,
  kind,
}: {
  src: string;
  fileName: string;
  kind: "image" | "pdf";
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex text-xs font-semibold underline underline-offset-2"
      >
        {kind === "pdf" ? "Visualizar PDF" : "Ampliar imagem"}
      </button>

      <dialog
        ref={dialogRef}
        aria-label={`Visualização de ${fileName}`}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
        className="m-auto h-[min(92dvh,900px)] w-[min(96vw,1200px)] max-w-none overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--vp-paper-pure)] p-0 text-[var(--foreground)] shadow-[var(--sh-lg)] backdrop:bg-black/70"
      >
        <div className="flex h-full min-h-0 flex-col">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{fileName}</p>
              <p className="text-xs text-[var(--muted)]">
                {kind === "pdf" ? "Documento PDF" : "Imagem"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={src}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold hover:bg-black/5"
              >
                Nova guia
              </a>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg bg-[var(--vp-wine)] px-3 py-2 text-xs font-semibold text-[var(--vp-gold)]"
                aria-label="Fechar visualizador"
              >
                Fechar
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 bg-black/5">
            {kind === "pdf" ? (
              <iframe
                src={src}
                title={fileName}
                className="h-full w-full border-0 bg-white"
              />
            ) : (
              <div className="flex h-full items-center justify-center p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={fileName}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
