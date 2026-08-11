"use client";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";

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

  return null;
}
