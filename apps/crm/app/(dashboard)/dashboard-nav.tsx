"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { dashboardNavItems } from "@/lib/dashboard-nav";
import { isClientCategoryValue } from "@/lib/client-categories";

function linkActive(pathname: string, href: string, searchParams: URLSearchParams): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/leads") {
    const cat = searchParams.get("client_category");
    if (pathname === "/leads" && cat && isClientCategoryValue(cat)) return false;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardNav() {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const categoryFilter = searchParams.get("client_category") ?? "";

  return (
    <nav className="flex flex-wrap gap-1 text-xs font-semibold uppercase tracking-[0.08em] md:gap-2 md:text-sm md:tracking-[0.06em]">
      {dashboardNavItems.map((n) => {
        if (n.kind === "link") {
          const active = linkActive(pathname, n.href, searchParams);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-md border-b-2 px-2.5 py-2 transition-colors duration-200 md:px-3 md:py-2.5 ${
                active
                  ? "border-[var(--vp-gold)] text-[var(--vp-gold)]"
                  : "border-transparent text-[rgba(255,248,247,0.78)] hover:bg-[rgba(255,248,247,0.1)] hover:text-[var(--vp-paper)]"
              }`}
            >
              {n.label}
            </Link>
          );
        }

        const dropdownActive =
          pathname === "/leads" && isClientCategoryValue(categoryFilter);

        return (
          <details key={n.id} className="group relative">
            <summary
              className={`list-none cursor-pointer rounded-md border-b-2 px-2.5 py-2 transition-colors duration-200 marker:content-none md:px-3 md:py-2.5 [&::-webkit-details-marker]:hidden ${
                dropdownActive
                  ? "border-[var(--vp-gold)] text-[var(--vp-gold)]"
                  : "border-transparent text-[rgba(255,248,247,0.78)] hover:bg-[rgba(255,248,247,0.1)] hover:text-[var(--vp-paper)]"
              }`}
            >
              {n.label}
            </summary>
            <div className="absolute left-0 z-50 mt-1 min-w-[12rem] rounded-md border border-[rgba(199,166,77,0.35)] bg-[var(--vp-wine)] py-1 text-[0.7rem] font-semibold uppercase tracking-[0.08em] shadow-lg md:text-xs">
              {n.items.map((item) => {
                const itemActive =
                  pathname === "/leads" && categoryFilter === item.label && isClientCategoryValue(item.label);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block px-3 py-2 no-underline transition-colors ${
                      itemActive
                        ? "bg-[rgba(255,248,247,0.12)] text-[var(--vp-gold)]"
                        : "text-[rgba(255,248,247,0.88)] hover:bg-[rgba(255,248,247,0.1)] hover:text-[var(--vp-paper)]"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </details>
        );
      })}
    </nav>
  );
}
