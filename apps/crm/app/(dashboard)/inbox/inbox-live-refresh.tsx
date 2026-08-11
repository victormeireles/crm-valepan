"use client";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

const REFRESH_DEBOUNCE_MS = 300;

/** Atualiza o Inbox apenas quando o Supabase informa uma mudança relevante. */
export function InboxLiveRefresh({
  selectedConversationId,
}: {
  selectedConversationId: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const visible = useRef(true);
  const changedWhileHidden = useRef(false);
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
    if (!selectedConversationId) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("cid")) return;

    url.searchParams.set("cid", selectedConversationId);
    router.replace(`${url.pathname}?${url.searchParams.toString()}`, { scroll: false });
  }, [router, selectedConversationId]);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (!visible.current) {
        changedWhileHidden.current = true;
        return;
      }
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        router.refresh();
      }, REFRESH_DEBOUNCE_MS);
    };

    const onVis = () => {
      visible.current = document.visibilityState === "visible";
      if (visible.current) {
        changedWhileHidden.current = false;
        scheduleRefresh();
      }
    };

    document.addEventListener("visibilitychange", onVis);

    const channel = supabase
      .channel("crm-inbox-live")
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
          const changedConversationId =
            (payload.new as { conversation_id?: string } | null)?.conversation_id ??
            (payload.old as { conversation_id?: string } | null)?.conversation_id ??
            null;
          if (changedConversationId !== selectedConversationId) scheduleRefresh();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "crm", table: "leads" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "crm", table: "opportunities" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "crm", table: "tasks" },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      document.removeEventListener("visibilitychange", onVis);
      void supabase.removeChannel(channel);
    };
  }, [router, selectedConversationId, supabase]);

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
