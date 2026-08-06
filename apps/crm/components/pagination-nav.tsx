import Link from "next/link";

export function PaginationNav({
  pathname,
  page,
  pageSize,
  totalCount,
  searchParams,
}: {
  pathname: string;
  page: number;
  pageSize: number;
  totalCount: number;
  searchParams: Record<string, string | string[] | undefined>;
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
      className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-3 py-2 text-xs"
    >
      <span className="tabular-nums text-[var(--muted)]">
        Página {page} de {totalPages} · {totalCount} registros
      </span>
      <div className="flex gap-2">
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
      </div>
    </nav>
  );
}
