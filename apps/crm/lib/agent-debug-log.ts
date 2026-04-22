/** Logs de debug da sessão do agente (NDJSON via ingest). Não enviar segredos nem PII. */
export function agentDebugLog(entry: {
  location: string;
  message: string;
  hypothesisId: string;
  data?: Record<string, unknown>;
  runId?: string;
}): void {
  fetch("http://127.0.0.1:7482/ingest/1895e58d-5aa0-4961-beb4-33f0532640bf", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "89ce04",
    },
    body: JSON.stringify({
      sessionId: "89ce04",
      location: entry.location,
      message: entry.message,
      hypothesisId: entry.hypothesisId,
      runId: entry.runId,
      data: entry.data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
}
