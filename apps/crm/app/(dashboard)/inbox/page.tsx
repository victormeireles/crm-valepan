import {
  loadRecentConversationMessages,
  type InboxMessageRow,
} from "@/lib/inbox/load-messages";
import { formatRelativeShort } from "@/lib/format-relative";
import { nestOne } from "@/lib/supabase/nested";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import Link from "next/link";
import { ChatThread } from "./chat-thread";
import { InboxLiveRefresh } from "./inbox-live-refresh";
import { SendMessageForm } from "./send-message-form";

/** Evita cache estático: mensagens novas precisam aparecer após webhook / envio. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PREVIEW_MAX = 80;

function previewLine(body: string | null | undefined): string {
  const t = (body ?? "").trim().replace(/\s+/g, " ");
  if (!t) return "Sem mensagem ainda";
  return t.length > PREVIEW_MAX ? `${t.slice(0, PREVIEW_MAX - 1)}…` : t;
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ cid?: string }>;
}) {
  const { cid } = await searchParams;
  const supabase = await createServerSupabaseClient();
  const crm = crmTables(supabase);

  const [{ data: conversations, error: conversationsError }, { data: tails, error: tailsError }] =
    await Promise.all([
      crm
        .from("conversations")
        .select("id, phone_e164, created_at, updated_at, leads(id, phone_e164, status, contacts(full_name))")
        .order("updated_at", { ascending: false }),
      crm
        .from("v_conversation_last_message")
        .select("conversation_id, lead_id, last_direction, last_sent_at, last_body_preview"),
    ]);

  const tailById = new Map((tails ?? []).map((t) => [t.conversation_id, t]));

  const conversationsSorted = [...(conversations ?? [])].sort((a, b) => {
    const ta = tailById.get(a.id)?.last_sent_at ?? a.updated_at;
    const tb = tailById.get(b.id)?.last_sent_at ?? b.updated_at;
    return tb.localeCompare(ta);
  });

  const validCid =
    cid && conversationsSorted.some((c) => c.id === cid) ? cid : null;
  const selectedId = validCid ?? conversationsSorted[0]?.id ?? null;
  const selected = conversationsSorted.find((c) => c.id === selectedId) ?? null;

  let messages: InboxMessageRow[] = [];
  let hasMoreOlder = false;
  let messagesError: { message: string; code?: string } | undefined;

  if (selectedId) {
    const res = await loadRecentConversationMessages(crm, selectedId);
    messages = res.messages;
    hasMoreOlder = res.hasMoreOlder;
    messagesError = res.error;
  }

  const selectedTail = selected ? tailById.get(selected.id) : undefined;
  const awaitingReply = selectedTail?.last_direction === "in";

  const dbError =
    conversationsError?.message ?? messagesError?.message ?? tailsError?.message;
  const schemaHint =
    conversationsError?.code === "PGRST106" ||
    messagesError?.code === "PGRST106" ||
    tailsError?.code === "PGRST106"
      ? "No Supabase: Settings → Data API → Exposed schemas → inclua o schema «crm» (o mesmo ajuste do webhook)."
      : null;

  const selectedLead = selected
    ? nestOne(
        selected.leads as
          | { id: string; status: string; contacts?: { full_name: string | null } | { full_name: string | null }[] | null }
          | { id: string; status: string; contacts?: { full_name: string | null } | { full_name: string | null }[] | null }[]
          | null,
      )
    : null;

  return (
    <div className="space-y-4">
      <InboxLiveRefresh />
      <div>
        <h1 className="text-lg font-semibold text-[var(--foreground)]">Inbox WhatsApp</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
          Recebidas e enviadas na mesma thread; o campo em baixo envia pela Z-API.
        </p>
        <details className="mt-3 max-w-2xl rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--muted)]">
          <summary className="cursor-pointer font-medium text-[var(--foreground)]">
            Configuração Z-API / webhook
          </summary>
          <p className="mt-2">
            No painel da Z-API, «Ao receber» e «Ao enviar» podem usar a mesma URL:{" "}
            <code className="rounded bg-[var(--background)] px-1 text-xs">/api/webhooks/zapi</code>.
          </p>
        </details>
        {dbError ? (
          <div
            className="mt-3 rounded-lg border border-[color:var(--border-strong)] bg-[var(--vp-surface)] px-3 py-2 text-sm text-[var(--vp-wine-classic)]"
            role="alert"
          >
            <p className="font-medium">Não foi possível carregar dados do CRM no navegador.</p>
            <p className="mt-1 font-mono text-xs opacity-90">{dbError}</p>
            {schemaHint ? <p className="mt-2 text-xs">{schemaHint}</p> : null}
          </div>
        ) : null}
      </div>
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-[var(--sh-sm)]">
          {conversationsSorted.map((c) => {
            const lead = nestOne(
              c.leads as
                | { id: string; status: string; contacts?: { full_name: string | null } | { full_name: string | null }[] | null }
                | { id: string; status: string; contacts?: { full_name: string | null } | { full_name: string | null }[] | null }[]
                | null,
            );
            const contact = nestOne(
              (lead?.contacts ?? null) as
                | { full_name: string | null }
                | { full_name: string | null }[]
                | null,
            );
            const contactName = contact?.full_name?.trim() || null;
            const tail = tailById.get(c.id);
            const rowAwaiting = tail?.last_direction === "in";
            const lastAt = tail?.last_sent_at ?? c.updated_at;
            return (
              <li key={c.id}>
                <Link
                  href={`/inbox?cid=${c.id}`}
                  className={`flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-[var(--vp-surface-low)] ${
                    c.id === selectedId
                      ? "border-l-[3px] border-l-[var(--vp-wine)] bg-[var(--vp-surface-low)]"
                      : "border-l-[3px] border-l-transparent"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-[var(--foreground)]">
                      {contactName ?? c.phone_e164}
                    </span>
                    <span className="shrink-0 text-[10px] text-[var(--muted)]" title={new Date(lastAt).toLocaleString("pt-BR")}>
                      {formatRelativeShort(lastAt)}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-xs text-[var(--muted)]">{previewLine(tail?.last_body_preview)}</p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[var(--muted)]">
                    <span>{lead ? `Lead · ${lead.status}` : "Sem lead"}</span>
                    {rowAwaiting ? (
                      <span
                        className="inline-flex items-center gap-1 font-medium text-[var(--vp-wine)]"
                        title="Última mensagem do cliente — aguarda resposta"
                      >
                        <span className="size-1.5 rounded-full bg-[var(--vp-wine)]" aria-hidden />
                        Aguarda resposta
                      </span>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
          {conversationsSorted.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-[var(--muted)]">
              Nenhuma conversa ainda. Envie uma mensagem de teste ou configure o webhook Z-API.
            </li>
          )}
        </ul>

        <section className="flex min-h-[480px] flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 shadow-[var(--sh-sm)] lg:max-h-[min(720px,calc(100vh-9rem))]">
          {selected ? (
            <>
              <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
                <div>
                  {(() => {
                    const selectedContact = nestOne(
                      (selectedLead?.contacts ?? null) as
                        | { full_name: string | null }
                        | { full_name: string | null }[]
                        | null,
                    );
                    const selectedContactName = selectedContact?.full_name?.trim() || null;
                    return (
                      <h2 className="font-medium text-[var(--foreground)]">
                        {selectedContactName
                          ? `${selectedContactName} · ${selected.phone_e164}`
                          : selected.phone_e164}
                      </h2>
                    );
                  })()}
                  <p className="text-xs text-[var(--muted)]">
                    Última atividade na conversa:{" "}
                    {new Date(selectedTail?.last_sent_at ?? selected.updated_at).toLocaleString("pt-BR")}
                  </p>
                  {awaitingReply ? (
                    <p className="mt-1 text-xs font-medium text-[var(--vp-wine)]">
                      Aguarda a sua resposta (última mensagem foi do cliente).
                    </p>
                  ) : null}
                </div>
              </div>

              <ChatThread
                key={selected.id}
                conversationId={selected.id}
                initialMessages={messages}
                hasMoreOlder={hasMoreOlder}
                messagesLoadError={messagesError?.message}
                technicalSummary={{
                  conversationId: selected.id,
                  leadId: selectedLead?.id ?? null,
                  phoneE164: selected.phone_e164,
                }}
              />

              <div className="mt-auto flex-shrink-0 border-t border-[var(--border)] pt-3">
                <SendMessageForm conversationId={selected.id} phone={selected.phone_e164} />
              </div>
            </>
          ) : (
            <p className="text-sm text-[var(--muted)]">Selecione uma conversa para ver as mensagens.</p>
          )}
        </section>
      </div>
    </div>
  );
}
