import {
  categoryLabel,
  categoryLetter,
  formatBrazilPhoneForDisplay,
} from "@/lib/lead-identity";
import type { ReactNode } from "react";

type LeadIdentitySize = "sm" | "md";
type LeadIdentityLayout = "stacked" | "inline";

const sizeClasses: Record<LeadIdentitySize, { name: string; sub: string; badge: string }> = {
  sm: {
    name: "text-sm font-medium",
    sub: "text-xs",
    badge: "h-5 min-w-[1.25rem] px-1 text-[10px]",
  },
  md: {
    name: "text-base font-medium",
    sub: "text-sm",
    badge: "h-6 min-w-[1.5rem] px-1.5 text-xs",
  },
};

export function CategoryBadge({
  category,
  size,
}: {
  category: string | null | undefined;
  size?: LeadIdentitySize;
}) {
  const letter = categoryLetter(category);
  const long = categoryLabel(category);
  if (!letter || !long) return null;
  const sz = size ?? "md";
  return (
    <span
      title={long}
      className={`inline-flex shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--vp-surface-low)] font-semibold tabular-nums text-[var(--vp-wine)] ${sizeClasses[sz].badge}`}
    >
      {letter}
    </span>
  );
}

export function LeadIdentity({
  name,
  companyName,
  category,
  phone,
  phoneTitle,
  size = "md",
  layout = "stacked",
  className,
  trailing,
}: {
  name: string;
  companyName?: string | null;
  category?: string | null;
  /** Telefone visível, formatado para leitura quando for um número brasileiro. */
  phone?: string | null;
  /** Telefone disponível apenas na dica de contexto. */
  phoneTitle?: string | null;
  size?: LeadIdentitySize;
  layout?: LeadIdentityLayout;
  className?: string;
  trailing?: ReactNode;
}) {
  const sub = (companyName ?? "").trim();
  const formattedPhone = formatBrazilPhoneForDisplay(phone);
  const contextualPhone = formattedPhone ?? formatBrazilPhoneForDisplay(phoneTitle);
  const title =
    [name, contextualPhone, sub.length > 0 ? sub : null].filter(Boolean).join(" · ") ||
    undefined;

  if (layout === "inline") {
    return (
      <div
        className={`flex min-w-0 flex-wrap items-center gap-1.5 ${className ?? ""}`}
        title={title}
      >
        <span className={`min-w-0 truncate ${sizeClasses[size].name} text-[var(--foreground)]`}>
          {name}
        </span>
        {sub.length > 0 ? (
          <span className={`min-w-0 truncate ${sizeClasses[size].sub} text-[var(--muted)]`}>
            · {sub}
          </span>
        ) : null}
        {formattedPhone ? (
          <span className={`${sizeClasses[size].sub} whitespace-nowrap text-[var(--muted)]`}>
            · {formattedPhone}
          </span>
        ) : null}
        <CategoryBadge category={category} size={size} />
        {trailing}
      </div>
    );
  }

  return (
    <div className={`min-w-0 ${className ?? ""}`} title={title}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`block truncate ${sizeClasses[size].name} text-[var(--foreground)]`}>
              {name}
            </span>
            <CategoryBadge category={category} size={size} />
            {trailing}
          </div>
          {formattedPhone ? (
            <p className={`${sizeClasses[size].sub} mt-0.5 truncate tabular-nums text-[var(--muted)]`}>
              {formattedPhone}
            </p>
          ) : null}
          {sub.length > 0 ? (
            <p className={`mt-0.5 truncate ${sizeClasses[size].sub} text-[var(--muted)]`}>{sub}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
