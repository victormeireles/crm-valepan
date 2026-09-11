export function recordInboxBrowserMetric(
  name: "conversation" | "lead_panel" | "sidebar_refresh",
  startedAt: number,
  detail: Record<string, boolean | number | string | null>,
) {
  if (typeof window === "undefined") return;
  const durationMs = Math.round((performance.now() - startedAt) * 10) / 10;
  performance.measure(`inbox:${name}`, { start: startedAt, duration: durationMs });
  const payload = { name, durationMs, ...detail };
  window.dispatchEvent(new CustomEvent("inbox:performance", { detail: payload }));
  if (new URLSearchParams(window.location.search).get("inbox_debug") === "1") {
    console.info("[inbox:performance]", payload);
  }
}
