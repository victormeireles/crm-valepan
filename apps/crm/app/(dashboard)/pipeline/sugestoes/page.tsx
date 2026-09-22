import { listPendingPipelineAdvanceSuggestions } from "@/app/actions/pipeline-advance";
import Link from "next/link";
import { PipelineAdvanceSuggestionsList } from "./suggestions-list";

export const dynamic = "force-dynamic";

export default async function PipelineAdvanceSuggestionsPage() {
  const { items, canRunJob } = await listPendingPipelineAdvanceSuggestions();

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--vp-ink-muted)]">
            <Link href="/pipeline" className="hover:underline">
              Funil
            </Link>
            <span> / Sugestões</span>
          </p>
          <h1
            className="text-[40px] leading-none tracking-[0.01em] text-[var(--vp-wine)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Avançar no funil
          </h1>
        </div>
        <p className="text-sm tabular-nums text-[var(--vp-ink-muted)]">
          {items.length === 1 ? "1 pendente" : `${items.length} pendentes`}
        </p>
      </div>
      <PipelineAdvanceSuggestionsList items={items} canRunJob={canRunJob} />
    </div>
  );
}
