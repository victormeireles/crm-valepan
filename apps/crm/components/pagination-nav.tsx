import Link from "next/link";

export function PaginationNav({
  pathname,
  page,
  pageSize,
  totalCount,
  searchParams,
  showBoundaryLinks = false,
}: {
  pathname: string;
  page: number;
  pageSize: number;
  totalCount: number;
  searchParams: Record<string, string | string[] | undefined>;
  showBoundaryLinks?: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (totalPages <= 1) return null;

  const hrefFor = (nextPage: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (key === "page" || value == null) continue;
      if (Array.isArray(value)) {
        for (const item of value) params.append(key, item);
      } else {
        params.set(key, value);
      }
    }
    if (nextPage > 1) params.set("page", String(nextPage));
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  return (
    <nav
      aria-label="Paginação"
      className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] px-3 py-2 text-xs"
    >
      <span className="tabular-nums text-[var(--muted)]">
        Página {page} de {totalPages} · {totalCount} registros
      </span>
      <div className="ml-auto flex flex-wrap justify-end gap-2">
        {showBoundaryLinks ? (
          <>
            {page > 1 ? (
              <Link
                href={hrefFor(1)}
                className="rounded border border-[var(--border)] px-2.5 py-1.5 font-medium hover:bg-[var(--vp-surface-low)]"
              >
                Primeira
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="cursor-not-allowed rounded border border-[var(--border)] px-2.5 py-1.5 font-medium opacity-40"
              >
                Primeira
              </span>
            )}
            {page < totalPages ? (
              <Link
                href={hrefFor(page + 1)}
                className="rounded border border-[var(--border)] px-2.5 py-1.5 font-medium hover:bg-[var(--vp-surface-low)]"
              >
                Próxima
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="cursor-not-allowed rounded border border-[var(--border)] px-2.5 py-1.5 font-medium opacity-40"
              >
                Próxima
              </span>
            )}
            {page < totalPages ? (
              <Link
                href={hrefFor(totalPages)}
                className="rounded border border-[var(--border)] px-2.5 py-1.5 font-medium hover:bg-[var(--vp-surface-low)]"
              >
                Última
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="cursor-not-allowed rounded border border-[var(--border)] px-2.5 py-1.5 font-medium opacity-40"
              >
                Última
              </span>
            )}
          </>
        ) : (
          <>
            {page > 1 ? (
              <Link
                href={hrefFor(page - 1)}
                className="rounded border border-[var(--border)] px-2.5 py-1.5 font-medium hover:bg-[var(--vp-surface-low)]"
              >
                Anterior
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link
                href={hrefFor(page + 1)}
                className="rounded border border-[var(--border)] px-2.5 py-1.5 font-medium hover:bg-[var(--vp-surface-low)]"
              >
                Próxima
              </Link>
            ) : null}
          </>
        )}
      </div>
    </nav>
  );
}
