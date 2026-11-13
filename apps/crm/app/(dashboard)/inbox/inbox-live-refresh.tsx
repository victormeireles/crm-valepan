"use client";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useEffect, useMemo, useRef, useState } from "react";

const ROW_DEBOUNCE_MS = 200;
const RECONCILE_DEBOUNCE_MS = 8_000;
const RECONCILE_COOLDOWN_MS = 15_000;

export const INBOX_SIDEBAR_ROW_CHANGED_EVENT = "crm:inbox-sidebar-row-changed";
export const INBOX_SIDEBAR_CHANGED_EVENT = "crm:inbox-sidebar-changed";

export type InboxSidebarRowChangedDetail = {
  conversationId: string;
  lastMessageAt: string | null;
  lastBodyPreview: string | null;
  lastDirection: string | null;
  lastInboundSentAt: string | null;
  lastReadAt: string | null;
  lastEventKind: string | null;
  lastEventStatus: string | null;
};

type ConversationRealtimeRow = {
  id?: string;
  last_message_at?: string | null;
  last_body_preview?: string | null;
  last_direction?: string | null;
  last_inbound_sent_at?: string | null;
  last_read_at?: string | null;
  last_event_kind?: string | null;
  last_event_status?: string | null;
};

function rowChanged(
  previous: ConversationRealtimeRow | null | undefined,
  next: ConversationRealtimeRow | null | undefined,
): boolean {
  if (!next?.id) return false;
  if (!previous) return true;
  return (
    previous.last_message_at !== next.last_message_at
    || previous.last_body_preview !== next.last_body_preview
    || previous.last_direction !== next.last_direction
    || previous.last_inbound_sent_at !== next.last_inbound_sent_at
    || previous.last_read_at !== next.last_read_at
    || previous.last_event_kind !== next.last_event_kind
    || previous.last_event_status !== next.last_event_status
  );
}

/** Atualiza o Inbox apenas quando o Supabase informa uma mudança relevante. */
export function InboxLiveRefresh() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const visible = useRef(true);
  const changedWhileHidden = useRef(false);
  const dirtyForReconcile = useRef(false);
  const lastReconcileAt = useRef(0);
  const pendingRowIds = useRef(new Map<string, InboxSidebarRowChangedDetail>());
  const [callAlert, setCallAlert] = useState<string | null>(null);

  const signalCall = (status: string | null | undefined) => {
    if (!status) return;
    const ringing = status === "ringing";
    const label = ringing
      ? "Cliente está ligando pelo WhatsApp agora"
      : status === "missed_video"
        ? "Videochamada não atendida"
        : "Ligação de voz não atendida";
    setCallAlert(label);
    window.setTimeout(() => setCallAlert(null), ringing ? 12000 : 7000);

    try {
      const AudioContextClass = window.AudioContext;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = ringing ? 720 : 440;
      gain.gain.setValueAtTime(0.08, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.35);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.35);
    } catch {
      // Alguns navegadores bloqueiam áudio antes da primeira interação do usuário.
    }

    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("CRM Valepan", { body: label, tag: "whatsapp-call" });
    }
  };

  useEffect(() => {
    let rowTimer: ReturnType<typeof setTimeout> | null = null;
    let reconcileTimer: ReturnType<typeof setTimeout> | null = null;

    const flushRows = () => {
      rowTimer = null;
      if (!visible.current) {
        changedWhileHidden.current = true;
        return;
      }
      const batch = Array.from(pendingRowIds.current.values());
      pendingRowIds.current.clear();
      for (const detail of batch) {
        window.dispatchEvent(new CustomEvent(INBOX_SIDEBAR_ROW_CHANGED_EVENT, { detail }));
      }
      dirtyForReconcile.current = true;
      scheduleReconcile();
    };

    const scheduleRowFlush = () => {
      if (rowTimer) clearTimeout(rowTimer);
      rowTimer = setTimeout(flushRows, ROW_DEBOUNCE_MS);
    };

    const scheduleReconcile = () => {
      if (!dirtyForReconcile.current) return;
      if (reconcileTimer) clearTimeout(reconcileTimer);
      const elapsed = Date.now() - lastReconcileAt.current;
      const wait = Math.max(RECONCILE_DEBOUNCE_MS, RECONCILE_COOLDOWN_MS - elapsed);
      reconcileTimer = setTimeout(() => {
        reconcileTimer = null;
        if (!dirtyForReconcile.current) return;
        if (!visible.current) {
          changedWhileHidden.current = true;
          return;
        }
        dirtyForReconcile.current = false;
        lastReconcileAt.current = Date.now();
        window.dispatchEvent(new CustomEvent(INBOX_SIDEBAR_CHANGED_EVENT));
      }, wait);
    };

    const queueConversation = (
      next: ConversationRealtimeRow | null | undefined,
      previous?: ConversationRealtimeRow | null,
    ) => {
      if (!next?.id || !rowChanged(previous, next)) return;
      pendingRowIds.current.set(next.id, {
        conversationId: next.id,
        lastMessageAt: next.last_message_at ?? null,
        lastBodyPreview: next.last_body_preview ?? null,
        lastDirection: next.last_direction ?? null,
        lastInboundSentAt: next.last_inbound_sent_at ?? null,
        lastReadAt: next.last_read_at ?? null,
        lastEventKind: next.last_event_kind ?? null,
        lastEventStatus: next.last_event_status ?? null,
      });
      if (!visible.current) {
        changedWhileHidden.current = true;
        dirtyForReconcile.current = true;
        return;
      }
      scheduleRowFlush();
    };

    const onVis = () => {
      visible.current = document.visibilityState === "visible";
      if (visible.current && changedWhileHidden.current) {
        changedWhileHidden.current = false;
        dirtyForReconcile.current = true;
        if (pendingRowIds.current.size > 0) flushRows();
        scheduleReconcile();
      }
    };

    document.addEventListener("visibilitychange", onVis);

    const channel = supabase
      .channel("crm-inbox-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "crm", table: "conversations" },
        (payload) => {
          queueConversation(
            payload.new as ConversationRealtimeRow | null,
            payload.old as ConversationRealtimeRow | null,
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "crm", table: "messages" },
        (payload) => {
          const changedRow = (payload.new as {
            conversation_id?: string;
            event_kind?: string | null;
            event_status?: string | null;
          } | null);
          if (changedRow?.event_kind === "whatsapp_call") {
            signalCall(changedRow.event_status);
          }
          // Lista: só via conversations (denormalizado). Não dispara snapshot completo.
        },
      )
      .subscribe();

    return () => {
      if (rowTimer) clearTimeout(rowTimer);
      if (reconcileTimer) clearTimeout(reconcileTimer);
      document.removeEventListener("visibilitychange", onVis);
      void supabase.removeChannel(channel);
    };
  }, [supabase]);

  return callAlert ? (
    <div
      className="fixed right-4 top-4 z-[100] flex items-center gap-3 rounded-2xl border border-[var(--vp-whatsapp)] bg-[var(--vp-paper-pure)] px-4 py-3 text-sm font-semibold text-[var(--foreground)] shadow-xl"
      role="alert"
    >
      <span className="animate-pulse text-xl" aria-hidden>📞</span>
      {callAlert}
    </div>
  ) : null;
}
