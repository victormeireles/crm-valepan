export function recordPipelineBrowserMetric(
  name: "filter" | "page" | "move",
  startedAt: number,
  detail: Record<string, boolean | number | string | null>,
) {
  if (typeof window === "undefined") return;
  const durationMs = Math.round((performance.now() - startedAt) * 10) / 10;
  performance.measure(`pipeline:${name}`, { start: startedAt, duration: durationMs });
  const payload = { name, durationMs, ...detail };
  window.dispatchEvent(new CustomEvent("pipeline:performance", { detail: payload }));
  if (new URLSearchParams(window.location.search).get("pipeline_debug") === "1") {
    console.info("[pipeline:performance]", payload);
  }
}
