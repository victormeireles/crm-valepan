"use client";

import { updateConversationClassification } from "@/app/actions/inbox";
import { updateLeadClientCategory } from "@/app/actions/leads";
import {
  INBOX_CLASSIFICATION_OPTIONS,
  isInboxClassification,
} from "@/lib/inbox-classifications";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function normalizeValue(v: string | null | undefined): string {
  const t = (v ?? "").trim();
  const u = t.toUpperCase();
  return u && isInboxClassification(u) ? u : "";
}

export function ConversationClassificationSelect({
  conversationId,
  classification,
  leadId,
  clientCategory,
}: {
  conversationId: string;
  classification: string | null;
  leadId: string | null;
  clientCategory: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(normalizeValue(classification));
  const [loading, setLoading] = useState(false);
  const [clientCategoryValue, setClientCategoryValue] = useState(
    normalizeClientCategory(clientCategory),
  );
  const [loadingClientCategory, setLoadingClientCategory] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setValue(normalizeValue(classification));
  }, [classification]);
  useEffect(() => {
    setClientCategoryValue(normalizeClientCategory(clientCategory));
  }, [clientCategory]);

  return (
    <div className="flex flex-col items-end gap-1">
      <label className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--muted)]">
        Status
      </label>
      <select
        value={value}
        disabled={loading}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          void (async () => {
            setLoading(true);
            setErr(null);
            const res = await updateConversationClassification({
              conversationId,
              classification: next.length > 0 ? next : null,
            });
            setLoading(false);
            if (!res.ok) {
              setErr(res.error ?? "Erro");
              setValue(normalizeValue(classification));
              return;
            }
            router.refresh();
          })();
        }}
        className="min-w-[16rem] rounded border border-[var(--border)] bg-[var(--vp-paper-pure)] px-2 py-1.5 text-xs text-[var(--foreground)]"
      >
        <option value="">— SEM MARCAÇÃO —</option>
        {INBOX_CLASSIFICATION_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      <label className="mt-1 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--muted)]">
        Categoria de cliente
      </label>
      <select
        value={clientCategoryValue}
        disabled={loadingClientCategory || !leadId}
        onChange={(e) => {
          const next = e.target.value as
            | ""
            | "hamburgueria"
            | "distribuidor"
            | "parceiros"
            | "outros";
          setClientCategoryValue(next);
          if (!leadId) return;
          void (async () => {
            setLoadingClientCategory(true);
            setErr(null);
            const res = await updateLeadClientCategory({
              leadId,
              category: next.length > 0 ? next : null,
            });
            setLoadingClientCategory(false);
            if (!res.ok) {
              setErr(res.error ?? "Erro");
              setClientCategoryValue(normalizeClientCategory(clientCategory));
              return;
            }
            if (next.length > 0) {
              router.push(`/leads?client_category=${encodeURIComponent(next)}`);
              return;
            }
            router.push("/leads");
          })();
        }}
        className="min-w-[16rem] rounded border border-[var(--border)] bg-[var(--vp-paper-pure)] px-2 py-1.5 text-xs text-[var(--foreground)]"
      >
        <option value="">— SEM MARCAÇÃO —</option>
        <option value="hamburgueria">HAMBURGUERIA</option>
        <option value="distribuidor">DISTRIBUIDOR</option>
        <option value="parceiros">PARCEIROS</option>
        <option value="outros">OUTROS</option>
      </select>
      {err ? <p className="text-[11px] text-[var(--vp-error)]">{err}</p> : null}
    </div>
  );
}

function normalizeClientCategory(
  v: string | null | undefined,
): "" | "hamburgueria" | "distribuidor" | "parceiros" | "outros" {
  const t = (v ?? "").trim().toLowerCase();
  if (t === "hamburgueria" || t === "distribuidor" || t === "parceiros" || t === "outros") return t;
  return "";
}
