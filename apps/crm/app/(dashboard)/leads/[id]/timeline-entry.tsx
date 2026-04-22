import type { Json } from "@/lib/database.types";

type TimelineRow = {
  kind: string;
  event_id: string;
  at: string;
  lead_id: string | null;
  opportunity_id: string | null;
  data: Json;
};

export function TimelineEntry({ row }: { row: TimelineRow }) {
  const data = row.data as Record<string, unknown>;

  if (row.kind === "message") {
    const dir = data.direction === "out" ? "Saída" : "Entrada";
    const body = typeof data.body === "string" ? data.body : "";
    return (
      <li className="border-b border-[var(--border)] pb-3 last:border-0">
        <div className="flex flex-wrap justify-between gap-2 text-xs text-[var(--muted)]">
          <span>Mensagem · {dir}</span>
          <span>{new Date(row.at).toLocaleString("pt-BR")}</span>
        </div>
        <p className="mt-1 whitespace-pre-wrap text-sm">{body || "(sem texto)"}</p>
      </li>
    );
  }

  if (row.kind === "note") {
    const body = typeof data.body === "string" ? data.body : "";
    return (
      <li className="border-b border-[var(--border)] pb-3 last:border-0">
        <div className="flex flex-wrap justify-between gap-2 text-xs text-[var(--muted)]">
          <span>Nota</span>
          <span>{new Date(row.at).toLocaleString("pt-BR")}</span>
        </div>
        <p className="mt-1 whitespace-pre-wrap text-sm">{body}</p>
      </li>
    );
  }

  if (row.kind === "task") {
    const title = typeof data.title === "string" ? data.title : "Tarefa";
    const done = data.done === true;
    const due = data.due_at ? new Date(String(data.due_at)).toLocaleString("pt-BR") : null;
    return (
      <li className="border-b border-[var(--border)] pb-3 last:border-0">
        <div className="flex flex-wrap justify-between gap-2 text-xs text-[var(--muted)]">
          <span>Tarefa {done ? "· concluída" : ""}</span>
          <span>{new Date(row.at).toLocaleString("pt-BR")}</span>
        </div>
        <p className="mt-1 text-sm font-medium">{title}</p>
        {due ? <p className="text-xs text-[var(--muted)]">Prazo: {due}</p> : null}
      </li>
    );
  }

  return (
    <li className="border-b border-[var(--border)] pb-3 last:border-0">
      <div className="flex flex-wrap justify-between gap-2 text-xs text-[var(--muted)]">
        <span>{row.kind}</span>
        <span>{new Date(row.at).toLocaleString("pt-BR")}</span>
      </div>
      <pre className="mt-1 whitespace-pre-wrap break-words text-xs">{JSON.stringify(data, null, 2)}</pre>
    </li>
  );
}
