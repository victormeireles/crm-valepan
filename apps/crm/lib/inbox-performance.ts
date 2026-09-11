export type InboxPerformanceOperation = {
  operation: string;
  durationMs: number;
};

type InboxMetricContext = Record<string, boolean | number | string | null>;

export async function timeInboxOperation<T>(operation: string, work: PromiseLike<T>) {
  const startedAt = performance.now();
  const value = await work;
  return {
    operation,
    durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
    value,
  };
}

export function logInboxPerformance(
  event: string,
  durationMs: number,
  operations: InboxPerformanceOperation[],
  context: InboxMetricContext,
) {
  if (process.env.INBOX_PERF_LOGS !== "1") return;
  console.info("[inbox:performance]", JSON.stringify({
    event,
    durationMs: Math.round(durationMs * 10) / 10,
    operations: Object.fromEntries(operations.map((item) => [item.operation, item.durationMs])),
    context,
  }));
}
