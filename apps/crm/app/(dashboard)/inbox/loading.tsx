export default function InboxLoading() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,40vh)_minmax(0,1fr)] gap-4 overflow-hidden min-[900px]:grid-cols-[316px_minmax(0,1fr)] min-[900px]:grid-rows-[minmax(0,1fr)] xl:grid-cols-[316px_minmax(0,1fr)_348px]">
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[14px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] shadow-[var(--sh-sm)]">
          <div className="border-b border-[var(--vp-ink-line)] p-3">
            <div className="mb-2.5 grid grid-cols-2 gap-1 rounded-[18px] bg-[rgba(35,0,4,0.06)] p-[3px]">
              {Array.from({ length: 4 }, (_, index) => (
                <span key={index} className="h-8 animate-pulse rounded-[14px] bg-[var(--vp-surface-high)]" />
              ))}
            </div>
            <span className="block h-10 animate-pulse rounded-full bg-[var(--vp-surface)]" />
          </div>
          <ul className="min-h-0 flex-1 divide-y divide-[var(--vp-surface-high)]">
            {Array.from({ length: 8 }, (_, index) => (
              <li key={index} className="px-3.5 py-3">
                <div className="flex items-start gap-2.5">
                  <span className="size-10 shrink-0 animate-pulse rounded-full bg-[var(--vp-surface-high)]" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <span className="block h-3 w-2/3 animate-pulse rounded bg-[var(--vp-surface-high)]" />
                    <span className="block h-3 w-full animate-pulse rounded bg-[var(--vp-surface)]" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[14px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] shadow-[var(--sh-sm)]">
          <div className="border-b border-[var(--vp-ink-line)] px-[18px] py-3.5">
            <div className="flex items-center gap-3">
              <span className="size-11 animate-pulse rounded-full bg-[var(--vp-surface-high)]" />
              <div className="min-w-0 flex-1 space-y-2">
                <span className="block h-4 w-40 animate-pulse rounded bg-[var(--vp-surface-high)]" />
                <span className="block h-3 w-56 animate-pulse rounded bg-[var(--vp-surface)]" />
              </div>
            </div>
          </div>
          <div className="flex flex-1 items-center justify-center text-sm text-[var(--vp-ink-muted)]">
            Carregando conversas…
          </div>
        </section>
      </div>
    </div>
  );
}
