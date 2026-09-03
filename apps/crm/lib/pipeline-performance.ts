type PipelineMetricContext = Record<string, boolean | number | string | null>;

export async function timePipelineOperation<T>(operation: string, work: PromiseLike<T>) {
  const startedAt = performance.now();
  const value = await work;
  return { operation, durationMs: Math.round((performance.now() - startedAt) * 10) / 10, value };
}

export function logPipelinePerformance(
  event: string,
  durationMs: number,
  operations: { operation: string; durationMs: number }[],
  context: PipelineMetricContext,
) {
  if (process.env.PIPELINE_PERF_LOGS !== "1") return;
  console.info("[pipeline:performance]", JSON.stringify({
    event,
    durationMs: Math.round(durationMs * 10) / 10,
    operations: Object.fromEntries(operations.map((item) => [item.operation, item.durationMs])),
    context,
  }));
}
