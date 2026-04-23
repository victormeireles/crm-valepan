import {
  loadRecentConversationMessages,
  type InboxMessageRow,
} from "@/lib/inbox/load-messages";
import { nestOne } from "@/lib/supabase/nested";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { ChatThread } from "./chat-thread";
import { InboxLiveRefresh } from "./inbox-live-refresh";
import { InboxSidebar, type InboxSidebarRow } from "./inbox-sidebar";
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

  const sidebarRows: InboxSidebarRow[] = conversationsSorted.map((c) => {
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
    return {
      id: c.id,
      displayName: contactName ?? c.phone_e164,
      phone_e164: c.phone_e164,
      preview: previewLine(tail?.last_body_preview),
      lastAt: tail?.last_sent_at ?? c.updated_at,
      leadLine: lead ? `Lead · ${lead.status}` : "Sem lead",
      awaiting: tail?.last_direction === "in",
    };
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <InboxLiveRefresh />
      {dbError ? (
        <div
          className="shrink-0 rounded-lg border border-[color:var(--border-strong)] bg-[var(--vp-surface)] px-3 py-2 text-sm text-[var(--vp-wine-classic)]"
          role="alert"
        >
          <p className="font-medium">Não foi possível carregar dados do CRM.</p>
          <p className="mt-1 font-mono text-xs opacity-90">{dbError}</p>
          {schemaHint ? <p className="mt-2 text-xs">{schemaHint}</p> : null}
        </div>
      ) : null}
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,40vh)_minmax(0,1fr)] gap-2 overflow-hidden lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] lg:grid-rows-1">
        <div className="h-full min-h-0 overflow-hidden">
          <InboxSidebar conversations={sidebarRows} selectedId={selectedId} />
        </div>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-[var(--sh-sm)]">
          {selected ? (
            <>
              <div className="shrink-0 border-b border-[var(--border)] px-3 pb-3 pt-3">
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

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3">
                <ChatThread
                  key={selected.id}
                  conversationId={selected.id}
                  initialMessages={messages}
                  hasMoreOlder={hasMoreOlder}
                  messagesLoadError={messagesError?.message}
                />
              </div>

              <div className="shrink-0 border-t border-[var(--border)] px-3 pb-3 pt-3">
                <SendMessageForm conversationId={selected.id} phone={selected.phone_e164} />
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center px-4 py-12">
              <p className="text-center text-sm text-[var(--muted)]">Nenhuma conversa para mostrar.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
