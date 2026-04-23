"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { dashboardNavLinks } from "@/lib/dashboard-nav";

function linkActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav className="flex flex-wrap gap-1 text-xs font-semibold uppercase tracking-[0.08em] md:gap-2 md:text-sm md:tracking-[0.06em]">
      {dashboardNavLinks.map((n) => {
        const active = linkActive(pathname, n.href);
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
      })}
    </nav>
  );
}
