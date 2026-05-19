import { timelineActivityLabel } from "@/lib/timeline-labels";
import type { Json } from "@/lib/database.types";
import Link from "next/link";

export type TimelineRow = {
  kind: string;
  event_id: string;
  at: string;
  lead_id: string | null;
  opportunity_id: string | null;
  data: Json;
};

function actorSuffix(data: Record<string, unknown>) {
  const name = typeof data.actor_name === "string" ? data.actor_name.trim() : "";
  return name ? ` · ${name}` : "";
}

export function TimelineEntry({ row }: { row: TimelineRow }) {
  const data = (row.data ?? {}) as Record<string, unknown>;

  if (row.kind === "message") {
    const dir = data.direction === "out" ? "Saída" : "Entrada";
    const body = typeof data.body === "string" ? data.body : "";
    const convId = typeof data.conversation_id === "string" ? data.conversation_id : null;
    return (
      <li className="border-b border-[var(--border)] pb-3 last:border-0">
        <div className="flex flex-wrap justify-between gap-2 text-xs text-[var(--muted)]">
          <span>Mensagem · {dir}</span>
          <time dateTime={row.at}>{new Date(row.at).toLocaleString("pt-BR")}</time>
        </div>
        <p className="mt-1 whitespace-pre-wrap text-sm">{body || "(sem texto)"}</p>
        {convId ? (
          <Link href={`/inbox?cid=${convId}`} className="mt-1 inline-block text-xs text-[var(--vp-wine)] hover:underline">
            Abrir conversa
          </Link>
        ) : null}
      </li>
    );
  }

  if (row.kind === "note") {
    const body = typeof data.body === "string" ? data.body : "";
    return (
      <li className="border-b border-[var(--border)] pb-3 last:border-0">
        <div className="flex flex-wrap justify-between gap-2 text-xs text-[var(--muted)]">
          <span>Nota</span>
          <time dateTime={row.at}>{new Date(row.at).toLocaleString("pt-BR")}</time>
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
          <span>Tarefa criada{done ? " (já concluída)" : ""}</span>
          <time dateTime={row.at}>{new Date(row.at).toLocaleString("pt-BR")}</time>
        </div>
        <p className="mt-1 text-sm font-medium">{title}</p>
        {due ? <p className="text-xs text-[var(--muted)]">Prazo: {due}</p> : null}
      </li>
    );
  }

  if (row.kind === "sample") {
    const status = typeof data.status === "string" ? data.status : "—";
    const contact = typeof data.contact_name === "string" ? data.contact_name : null;
    const bread = typeof data.bread_type === "string" ? data.bread_type : null;
    return (
      <li className="border-b border-[var(--border)] pb-3 last:border-0">
        <div className="flex flex-wrap justify-between gap-2 text-xs text-[var(--muted)]">
          <span>Amostra</span>
          <time dateTime={row.at}>{new Date(row.at).toLocaleString("pt-BR")}</time>
        </div>
        <p className="mt-1 text-sm">
          Status: <strong>{status}</strong>
          {contact ? ` · ${contact}` : ""}
        </p>
        {bread ? <p className="text-xs text-[var(--muted)]">{bread}</p> : null}
        <Link href="/samples" className="mt-1 inline-block text-xs text-[var(--vp-wine)] hover:underline">
          Ver amostras
        </Link>
      </li>
    );
  }

  if (row.kind === "activity") {
    const action = typeof data.action === "string" ? data.action : "activity";
    const payload = (data.payload ?? {}) as Record<string, unknown>;
    const label = timelineActivityLabel(action);

    let detail: string | null = null;
    if (action === "stage_changed") {
      const stageName =
        typeof payload.stage_name === "string"
          ? payload.stage_name
          : typeof payload.stage_id === "string"
            ? payload.stage_id
            : null;
      if (stageName) detail = `Nova etapa: ${stageName}`;
      const lost = typeof payload.lost_reason === "string" ? payload.lost_reason.trim() : "";
      if (lost) detail = detail ? `${detail} · Motivo: ${lost}` : `Motivo: ${lost}`;
    }
    if (
      action === "task_completed" ||
      action === "task_reopened" ||
      action === "task_deleted"
    ) {
      const title = typeof payload.title === "string" ? payload.title : null;
      if (title) detail = title;
    }
    if (action === "task_rescheduled") {
      const title = typeof payload.title === "string" ? payload.title : null;
      const fromDue = typeof payload.from_due_at === "string" ? payload.from_due_at : null;
      const toDue = typeof payload.to_due_at === "string" ? payload.to_due_at : null;
      const fmt = (iso: string) =>
        new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
      if (title && fromDue && toDue) {
        detail = `${title}: ${fmt(fromDue)} → ${fmt(toDue)}`;
      } else if (title) {
        detail = title;
      }
    }
    if (action === "owner_changed") {
      const ownerName = typeof payload.owner_name === "string" ? payload.owner_name.trim() : "";
      if (ownerName) detail = `Responsável: ${ownerName}`;
      else detail = payload.owner_id ? "Novo responsável definido" : "Responsável removido";
    }
    if (action === "stage_automation_tasks") {
      const titles = Array.isArray(payload.task_titles)
        ? (payload.task_titles as unknown[]).filter((t): t is string => typeof t === "string")
        : [];
      if (titles.length > 0) detail = titles.join(" · ");
    }

    return (
      <li className="border-b border-[var(--border)] pb-3 last:border-0">
        <div className="flex flex-wrap justify-between gap-2 text-xs text-[var(--muted)]">
          <span>
            {label}
            {actorSuffix(data)}
          </span>
          <time dateTime={row.at}>{new Date(row.at).toLocaleString("pt-BR")}</time>
        </div>
        {detail ? <p className="mt-1 text-sm">{detail}</p> : null}
      </li>
    );
  }

  return (
    <li className="border-b border-[var(--border)] pb-3 last:border-0">
      <div className="flex flex-wrap justify-between gap-2 text-xs text-[var(--muted)]">
        <span>{row.kind}</span>
        <time dateTime={row.at}>{new Date(row.at).toLocaleString("pt-BR")}</time>
      </div>
    </li>
  );
}
