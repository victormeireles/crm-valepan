"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** Atualiza a lista/thread quando chegam webhooks (mesma URL para receber e enviar na Z-API). */
export function InboxLiveRefresh({ intervalMs = 20000 }: { intervalMs?: number }) {
  const router = useRouter();
  const visible = useRef(true);

  useEffect(() => {
    const onVis = () => {
      visible.current = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVis);
    const id = setInterval(() => {
      if (visible.current) router.refresh();
    }, intervalMs);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [router, intervalMs]);

  return null;
}
