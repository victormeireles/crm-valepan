import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { CrmIcon, type CrmIconName } from "@/components/crm-icon";

type PageItem = number | "ellipsis";

function buildPageItems(page: number, totalPages: number, siblingCount = 1): PageItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const items: PageItem[] = [1];
  const left = Math.max(2, page - siblingCount);
  const right = Math.min(totalPages - 1, page + siblingCount);

  if (left > 2) items.push("ellipsis");
  for (let n = left; n <= right; n += 1) items.push(n);
  if (right < totalPages - 1) items.push("ellipsis");
  items.push(totalPages);
  return items;
}

const btnBase =
  "inline-flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-md text-[12px] font-medium tabular-nums transition-[background-color,color,opacity,border-color] duration-150 ease-out";
const btnIdle =
  "border border-transparent text-[var(--vp-ink-body)] hover:bg-[var(--vp-surface-high)] active:bg-[var(--vp-surface-highest)]";
const btnActive =
  "border border-[var(--vp-wine)]/15 bg-[var(--vp-wine)] text-[var(--vp-gold)] shadow-[0_1px_0_rgba(35,0,4,0.12)]";
const btnDisabled =
  "cursor-not-allowed border border-transparent text-[var(--vp-ink-muted)] opacity-40";

export function PaginationNav({
  pathname,
  page,
  pageSize,
  totalCount,
  searchParams,
  onNavigate,
}: {
  pathname: string;
  page: number;
  pageSize: number;
  totalCount: number;
  searchParams: Record<string, string | string[] | undefined>;
  onNavigate?: (href: string) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (totalPages <= 1) return null;

  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, totalCount);
  const pageItems = buildPageItems(safePage, totalPages);
  const canPrev = safePage > 1;
  const canNext = safePage < totalPages;

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

  const navigateProps = (href: string) =>
    onNavigate
      ? {
          onClick: (event: MouseEvent<HTMLAnchorElement>) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
            event.preventDefault();
            onNavigate(href);
          },
        }
      : {};

  const iconControl = (
    enabled: boolean,
    targetPage: number,
    label: string,
    icon: CrmIconName,
  ): ReactNode => {
    if (!enabled) {
      return (
        <span aria-disabled="true" className={`${btnBase} ${btnDisabled}`} title={label}>
          <CrmIcon name={icon} className="text-[15px]" />
          <span className="sr-only">{label}</span>
        </span>
      );
    }
    const href = hrefFor(targetPage);
    return (
      <Link
        href={href}
        prefetch={false}
        aria-label={label}
        title={label}
        className={`${btnBase} ${btnIdle}`}
        {...navigateProps(href)}
      >
        <CrmIcon name={icon} className="text-[15px]" />
      </Link>
    );
  };

  return (
    <nav
      aria-label="Paginação"
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-[var(--border)] bg-[var(--vp-paper-pure)]/80 px-3 py-2"
    >
      <p className="min-w-0 text-[11px] leading-snug text-[var(--muted)]">
        <span className="font-medium tabular-nums text-[var(--vp-ink-body)]">
          {from}–{to}
        </span>
        <span className="mx-1 text-[var(--vp-ink-line)]">·</span>
        <span className="tabular-nums">{totalCount} registros</span>
      </p>

      <div className="ml-auto flex items-center gap-0.5" role="group" aria-label="Controles de página">
        {iconControl(canPrev, 1, "Primeira página", "first_page")}
        {iconControl(canPrev, safePage - 1, "Página anterior", "chevron_left")}

        <div className="mx-0.5 flex items-center gap-0.5">
          {pageItems.map((item, index) => {
            if (item === "ellipsis") {
              return (
                <span
                  key={`e-${index}`}
                  aria-hidden="true"
                  className="inline-flex h-8 min-w-6 items-center justify-center text-[12px] text-[var(--vp-ink-muted)]"
                >
                  …
                </span>
              );
            }
            const active = item === safePage;
            const href = hrefFor(item);
            if (active) {
              return (
                <span
                  key={item}
                  aria-current="page"
                  className={`${btnBase} ${btnActive} px-2`}
                >
                  {item}
                </span>
              );
            }
            return (
              <Link
                key={item}
                href={href}
                prefetch={false}
                aria-label={`Ir para página ${item}`}
                className={`${btnBase} ${btnIdle} px-2`}
                {...navigateProps(href)}
              >
                {item}
              </Link>
            );
          })}
        </div>

        {iconControl(canNext, safePage + 1, "Próxima página", "chevron_right")}
        {iconControl(canNext, totalPages, "Última página", "last_page")}
      </div>
    </nav>
  );
}
