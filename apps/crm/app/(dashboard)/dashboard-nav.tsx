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
    <nav className="flex flex-wrap gap-1 text-sm">
      {dashboardNavLinks.map((n) => {
        const active = linkActive(pathname, n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`rounded-md px-2 py-1 transition-colors duration-200 ${
              active
                ? "bg-[var(--vp-surface)] font-medium text-[var(--vp-wine)] ring-1 ring-[var(--vp-gold-classic)]/40"
                : "text-[var(--muted)] hover:bg-[var(--vp-surface-low)] hover:text-[var(--foreground)]"
            }`}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
