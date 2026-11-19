"use client";

import { signOutAction } from "@/app/actions/auth";
import { MobileSheet } from "@/components/mobile-sheet";
import { CrmIcon, type CrmIconName } from "@/components/crm-icon";
import { dashboardNavItems, type DashboardNavItem } from "@/lib/dashboard-nav";
import { formatUnreadBadge } from "@/app/(dashboard)/inbox/inbox-location";
import { isClientCategoryValue } from "@/lib/client-categories";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const PRIMARY: { href: string; label: string; icon: CrmIconName }[] = [
  { href: "/inbox", label: "Chat", icon: "chat" },
  { href: "/pipeline", label: "Funil", icon: "conversion_path" },
  { href: "/tasks", label: "Tarefas", icon: "task_alt" },
  { href: "/samples", label: "Amostras", icon: "inventory_2" },
];

const PRIMARY_HREFS = new Set(PRIMARY.map((item) => item.href));

function itemActive(pathname: string, href: string, searchParams: URLSearchParams): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href.startsWith("/leads?")) {
    const wanted = new URL(href, "http://local.invalid").searchParams.get("client_category");
    return pathname === "/leads" && searchParams.get("client_category") === wanted;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileTabBar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const [moreOpen, setMoreOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const stored = window.sessionStorage.getItem("crm-inbox-unread-total");
    if (stored) setUnread(Number(stored) || 0);
    const onTotal = (event: Event) => {
      const total = (event as CustomEvent<{ total?: number }>).detail?.total ?? 0;
      setUnread(total);
      window.sessionStorage.setItem("crm-inbox-unread-total", String(total));
    };
    window.addEventListener("crm:inbox-unread-total", onTotal);
    return () => window.removeEventListener("crm:inbox-unread-total", onTotal);
  }, []);

  const items: DashboardNavItem[] = isAdmin
    ? dashboardNavItems.map((item) =>
        item.kind === "dropdown" && item.id === "settings"
          ? { ...item, items: [...item.items, { href: "/settings/usuarios", label: "Usuários" }] }
          : item,
      )
    : dashboardNavItems;
  const moreItems = items.filter((item) => item.kind === "dropdown" || !PRIMARY_HREFS.has(item.href));
  const unreadBadge = formatUnreadBadge(unread);

  return (
    <>
      <nav
        data-mobile-tabbar
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-1.5 pt-1.5 pb-[max(6px,env(safe-area-inset-bottom))] md:hidden"
      >
        {PRIMARY.map((item) => {
          const active = itemActive(pathname, item.href, searchParams);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-[11px] font-bold ${
                active ? "text-[var(--vp-wine)]" : "text-[var(--vp-ink-soft)]"
              }`}
            >
              <span
                className={`relative grid h-[30px] w-14 place-items-center rounded-full ${
                  active ? "bg-[rgba(35,0,4,0.09)]" : ""
                }`}
              >
                <CrmIcon name={item.icon} className="text-[22px]" />
                {item.href === "/inbox" && unreadBadge ? (
                  <span className="absolute -right-0.5 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--vp-wine)] px-1 text-[10px] font-bold leading-none text-[var(--vp-paper-pure)]">
                    {unreadBadge}
                  </span>
                ) : null}
              </span>
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          onClick={() => setMoreOpen(true)}
          className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-[11px] font-bold ${
            moreOpen ? "text-[var(--vp-wine)]" : "text-[var(--vp-ink-soft)]"
          }`}
        >
          <span className={`grid h-[30px] w-14 place-items-center rounded-full ${moreOpen ? "bg-[rgba(35,0,4,0.09)]" : ""}`}>
            <CrmIcon name="more_horiz" className="text-[22px]" />
          </span>
          Mais
        </button>
      </nav>
      <MobileSheet open={moreOpen} title="Mais" onClose={() => setMoreOpen(false)}>
        <div className="pb-2">
          {moreItems.map((item) => {
            if (item.kind === "link") {
              const active = itemActive(pathname, item.href, searchParams);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={`flex min-h-11 items-center px-4 text-[13px] font-semibold uppercase tracking-[0.06em] ${
                    active ? "bg-[rgba(35,0,4,0.06)] text-[var(--vp-wine)]" : "text-[var(--vp-ink-body)]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            }
            const dropdownActive = item.id === "client-categories"
              ? pathname === "/leads" && isClientCategoryValue(searchParams.get("client_category") ?? "")
              : item.items.some((entry) => pathname === entry.href || pathname.startsWith(`${entry.href}/`));
            return (
              <details key={item.id} className="group" open={dropdownActive || undefined}>
                <summary className={`flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-[13px] font-semibold uppercase tracking-[0.06em] marker:content-none [&::-webkit-details-marker]:hidden ${
                  dropdownActive ? "text-[var(--vp-wine)]" : "text-[var(--vp-ink-body)]"
                }`}
                >
                  {item.label}
                  <CrmIcon name="expand_more" className="text-[18px] text-[var(--vp-gold-deep)] group-open:rotate-180" />
                </summary>
                {item.items.map((entry) => {
                  const active = item.id === "client-categories"
                    ? pathname === "/leads" && searchParams.get("client_category") === entry.label
                    : pathname === entry.href || pathname.startsWith(`${entry.href}/`);
                  return (
                    <Link
                      key={entry.href}
                      href={entry.href}
                      onClick={() => setMoreOpen(false)}
                      className={`flex min-h-11 items-center px-8 text-sm font-semibold ${
                        active ? "text-[var(--vp-wine)]" : "text-[var(--vp-ink-muted)]"
                      }`}
                    >
                      {entry.label}
                    </Link>
                  );
                })}
              </details>
            );
          })}
          <form action={signOutAction} className="mt-2 border-t border-[var(--vp-ink-line)]">
            <button
              type="submit"
              className="flex min-h-11 w-full items-center px-4 text-left text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--vp-error)]"
            >
              Sair
            </button>
          </form>
        </div>
      </MobileSheet>
    </>
  );
}
