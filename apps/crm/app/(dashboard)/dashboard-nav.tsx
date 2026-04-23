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
    <nav className="flex flex-wrap gap-2 text-sm md:gap-3">
      {dashboardNavLinks.map((n) => {
        const active = linkActive(pathname, n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`rounded-md border-b-2 px-3 py-2.5 transition-colors duration-200 ${
              active
                ? "border-[var(--vp-gold-classic)] font-semibold text-[var(--vp-wine)]"
                : "border-transparent text-[var(--muted)] hover:bg-[var(--vp-surface-low)] hover:text-[var(--foreground)]"
            }`}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
