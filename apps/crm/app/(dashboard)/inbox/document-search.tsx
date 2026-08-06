"use client";

import { FormEvent, useState } from "react";

type SearchResult = {
  message_id: string;
  file_name: string | null;
  summary: string | null;
  document_type: string | null;
  processed_at: string | null;
};

export function DocumentSearch({ conversationId }: { conversationId: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(event: FormEvent) {
    event.preventDefault();
    const value = query.trim();
    if (value.length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: value, conversationId });
      const response = await fetch(`/api/documents/search?${params}`, { cache: "no-store" });
      const payload = (await response.json()) as {
        results?: SearchResult[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Falha ao pesquisar documentos.");
      setResults(payload.results ?? []);
      setSearched(true);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Falha na pesquisa.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="shrink-0 border-b border-[var(--border)] px-1 pb-2">
      <form onSubmit={search} className="flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar dentro dos documentos desta conversa…"
          className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--vp-paper-pure)] px-3 py-2 text-xs outline-none focus:border-[var(--vp-wine)]"
        />
        <button
          type="submit"
          disabled={loading || query.trim().length < 2}
          className="rounded-xl bg-[var(--vp-wine)] px-3 py-2 text-xs font-semibold text-[var(--vp-gold)] disabled:opacity-50"
        >
          {loading ? "Buscando…" : "Buscar"}
        </button>
      </form>

      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
      {searched ? (
        <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
          {results.length === 0 ? (
            <p className="px-1 text-xs text-[var(--muted)]">Nenhum documento processado encontrado.</p>
          ) : (
            results.map((result) => (
              <button
                key={result.message_id}
                type="button"
                onClick={() => {
                  document
                    .getElementById(`message-${result.message_id}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
                className="block w-full rounded-lg border border-[var(--border)] bg-[var(--vp-paper-pure)] p-2 text-left hover:border-[var(--vp-wine)]/40"
              >
                <span className="block truncate text-xs font-semibold">
                  {result.file_name || result.document_type || "Documento"}
                </span>
                <span className="mt-0.5 line-clamp-2 block text-[11px] text-[var(--muted)]">
                  {result.summary}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
