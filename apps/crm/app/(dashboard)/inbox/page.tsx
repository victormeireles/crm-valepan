import {
  loadRecentConversationMessages,
  type InboxMessageRow,
} from "@/lib/inbox/load-messages";
import { nestOne } from "@/lib/supabase/nested";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import Link from "next/link";
import { ChatThread } from "./chat-thread";
import { InboxLiveRefresh } from "./inbox-live-refresh";
import { SendMessageForm } from "./send-message-form";

/** Evita cache estático: mensagens novas precisam aparecer após webhook / envio. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ cid?: string }>;
}) {
  const { cid } = await searchParams;
  const supabase = await createServerSupabaseClient();
  const crm = crmTables(supabase);

  const {
    data: conversations,
    error: conversationsError,
  } = await crm
    .from("conversations")
    .select("id, phone_e164, created_at, updated_at, leads(id, phone_e164, status)")
    .order("updated_at", { ascending: false });

  const selectedId = cid ?? conversations?.[0]?.id ?? null;
  const selected = (conversations ?? []).find((c) => c.id === selectedId) ?? null;

  let messages: InboxMessageRow[] = [];
  let hasMoreOlder = false;
  let messagesError: { message: string; code?: string } | undefined;

  if (selectedId) {
    const res = await loadRecentConversationMessages(crm, selectedId);
    messages = res.messages;
    hasMoreOlder = res.hasMoreOlder;
    messagesError = res.error;
  }

  const dbError = conversationsError?.message ?? messagesError?.message;
  const schemaHint =
    conversationsError?.code === "PGRST106" ||
    messagesError?.code === "PGRST106"
      ? "No Supabase: Settings → Data API → Exposed schemas → inclua o schema «crm» (o mesmo ajuste do webhook)."
      : null;

  return (
    <div className="space-y-4">
      <InboxLiveRefresh />
      <div>
        <h1 className="text-lg font-semibold">Inbox WhatsApp</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
          Recebidas e enviadas aparecem na mesma thread; o campo abaixo envia pelo WhatsApp (Z-API). No painel da
          Z-API, «Ao receber» e «Ao enviar» podem usar a mesma URL:{" "}
          <code className="rounded bg-[var(--background)] px-1 text-xs">/api/webhooks/zapi</code>.
        </p>
        {dbError ? (
          <div
            className="mt-3 rounded-lg border border-amber-600/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
            role="alert"
          >
            <p className="font-medium">Não foi possível carregar dados do CRM no navegador.</p>
            <p className="mt-1 font-mono text-xs opacity-90">{dbError}</p>
            {schemaHint ? <p className="mt-2 text-xs">{schemaHint}</p> : null}
          </div>
        ) : null}
      </div>
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--card)]">
          {(conversations ?? []).map((c) => {
            const lead = nestOne(
              c.leads as { id: string; status: string } | { id: string; status: string }[] | null,
            );
            return (
              <li key={c.id}>
                <Link
                  href={`/inbox?cid=${c.id}`}
                  className={`flex flex-col gap-0.5 px-4 py-3 hover:bg-[var(--background)] ${
                    c.id === selectedId ? "bg-[var(--background)]" : ""
                  }`}
                >
                  <span className="font-medium">{c.phone_e164}</span>
                  <span className="text-xs text-[var(--muted)]">
                    {lead ? `Lead · ${lead.status}` : "Sem lead"}
                  </span>
                </Link>
              </li>
            );
          })}
          {(!conversations || conversations.length === 0) && (
            <li className="px-4 py-8 text-center text-sm text-[var(--muted)]">
              Nenhuma conversa ainda. Envie uma mensagem de teste ou configure o webhook Z-API.
            </li>
          )}
        </ul>

        <section className="flex min-h-[480px] flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 lg:max-h-[min(720px,calc(100vh-9rem))]">
          {selected ? (
            <>
              <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
                <div>
                  <h2 className="font-medium">{selected.phone_e164}</h2>
                  <p className="text-xs text-[var(--muted)]">
                    Atualizado em {new Date(selected.updated_at).toLocaleString("pt-BR")}
                  </p>
                </div>
              </div>

              <ChatThread
                key={selected.id}
                conversationId={selected.id}
                initialMessages={messages}
                hasMoreOlder={hasMoreOlder}
                messagesLoadError={messagesError?.message}
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
