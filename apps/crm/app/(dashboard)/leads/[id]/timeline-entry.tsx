import type { Json } from "@/lib/database.types";

type TimelineRow = {
  kind: string;
  event_id: string;
  at: string;
  lead_id: string | null;
  opportunity_id: string | null;
  data: Json;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function activityDescription(data: Record<string, unknown>): { title: string; detail?: string } {
  const action = str(data.action) ?? "";
  const payload = (data.payload as Record<string, unknown> | null) ?? {};

  switch (action) {
    case "stage_changed": {
      const stageName = str(data.stage_name);
      const lost = str(payload.lost_reason);
      return {
        title: stageName ? `Etapa do funil: ${stageName}` : "Etapa do funil alterada",
        detail: lost ? `Motivo: ${lost}` : undefined,
      };
    }
    case "created":
      return { title: "Oportunidade criada" };
    case "owner_changed": {
      const ownerName = str(data.owner_name);
      return {
        title: ownerName ? `Responsável do lead: ${ownerName}` : "Responsável do lead removido ou alterado",
      };
    }
    case "created_manual": {
      const phone = str(payload.phone);
      const source = str(payload.source);
      return {
        title: "Lead criado manualmente",
        detail: [source && `Origem: ${source}`, phone && `Telefone: ${phone}`].filter(Boolean).join(" · ") || undefined,
      };
    }
    case "created_from_whatsapp": {
      const phone = str(payload.phone);
      return { title: "Lead criado via WhatsApp", detail: phone ?? undefined };
    }
    case "outbound_whatsapp_contact": {
      const name = str(payload.contact_name);
      const phone = str(payload.contact_phone);
      return {
        title: "Contato enviado por WhatsApp",
        detail: [name, phone].filter(Boolean).join(" · ") || undefined,
      };
    }
    case "outbound_whatsapp_attachment": {
      const name = str(payload.file_name);
      return { title: "Anexo enviado por WhatsApp", detail: name ?? undefined };
    }
    default:
      return {
        title: action ? `Atividade: ${action}` : "Atividade",
      };
  }
}

export function TimelineEntry({ row }: { row: TimelineRow }) {
  const data = row.data as Record<string, unknown>;

  if (row.kind === "message") {
    const dir = data.direction === "out" ? "Saída" : "Entrada";
    const body = typeof data.body === "string" ? data.body : "";
    return (
      <li className="border-b border-[var(--border)] pb-3 last:border-0">
        <div className="flex flex-wrap justify-between gap-2 text-xs text-[var(--muted)]">
          <span>Mensagem · {dir}</span>
          <time dateTime={row.at}>{new Date(row.at).toLocaleString("pt-BR")}</time>
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
    const assignee = str(data.assignee_name);
    return (
      <li className="border-b border-[var(--border)] pb-3 last:border-0">
        <div className="flex flex-wrap justify-between gap-2 text-xs text-[var(--muted)]">
          <span>Tarefa {done ? "· concluída" : ""}</span>
          <time dateTime={row.at}>{new Date(row.at).toLocaleString("pt-BR")}</time>
        </div>
        <p className="mt-1 text-sm font-medium">{title}</p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--muted)]">
          {due ? <span>Prazo: {due}</span> : <span>Sem prazo</span>}
          {assignee ? <span>Responsável: {assignee}</span> : null}
        </div>
      </li>
    );
  }

  if (row.kind === "activity") {
    const { title, detail } = activityDescription(data);
    const actor = str(data.actor_name);
    return (
      <li className="border-b border-[var(--border)] pb-3 last:border-0">
        <div className="flex flex-wrap justify-between gap-2 text-xs text-[var(--muted)]">
          <span>Registo comercial{actor ? ` · ${actor}` : ""}</span>
          <time dateTime={row.at}>{new Date(row.at).toLocaleString("pt-BR")}</time>
        </div>
        <p className="mt-1 text-sm font-medium">{title}</p>
        {detail ? <p className="mt-0.5 text-xs text-[var(--muted)]">{detail}</p> : null}
      </li>
    );
  }

  return (
    <li className="border-b border-[var(--border)] pb-3 last:border-0">
      <div className="flex flex-wrap justify-between gap-2 text-xs text-[var(--muted)]">
        <span>{row.kind}</span>
        <time dateTime={row.at}>{new Date(row.at).toLocaleString("pt-BR")}</time>
      </div>
      <pre className="mt-1 whitespace-pre-wrap break-words text-xs">{JSON.stringify(data, null, 2)}</pre>
    </li>
  );
}
