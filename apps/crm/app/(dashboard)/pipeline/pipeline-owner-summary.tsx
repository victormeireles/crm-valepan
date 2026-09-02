type PipelineOwnerSummaryProps = {
  ownerName: string;
  isMine: boolean;
  openCount: number;
  awaitingReplyCount: number;
  staleCount: number;
  overdueCount: number;
};

const METRICS: Array<{
  key: keyof Pick<
    PipelineOwnerSummaryProps,
    "openCount" | "awaitingReplyCount" | "staleCount" | "overdueCount"
  >;
  label: string;
}> = [
  { key: "openCount", label: "Abertas" },
  { key: "awaitingReplyCount", label: "Sem resposta" },
  { key: "staleCount", label: "Paradas" },
  { key: "overdueCount", label: "Ações vencidas" },
];

export function PipelineOwnerSummary(props: PipelineOwnerSummaryProps) {
  return (
    <section
      aria-label={`Resumo de desempenho de ${props.ownerName}`}
      className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border-y border-r border-[var(--border)] border-l-[3px] border-l-[var(--vp-gold-classic)] bg-[var(--vp-paper-pure)] px-4 py-3 shadow-[var(--sh-sm)]"
    >
      <div className="min-w-[10rem] flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--vp-gold-classic)]">
          {props.isMine ? "Minha carteira" : "Desempenho do vendedor"}
        </p>
        <h2 className="mt-0.5 truncate text-sm font-semibold text-[var(--vp-wine)]">
          {props.ownerName}
        </h2>
      </div>

      <dl className="grid flex-[2_1_28rem] grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
        {METRICS.map((metric) => (
          <div key={metric.key} className="min-w-0 border-l border-[var(--border)] pl-3">
            <dd className="text-lg font-bold tabular-nums text-[var(--vp-wine)]">
              {props[metric.key]}
            </dd>
            <dt className="truncate text-[11px] text-[var(--muted)]">{metric.label}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}
