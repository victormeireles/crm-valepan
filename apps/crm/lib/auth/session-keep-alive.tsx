"use client";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useEffect, useMemo } from "react";

/**
 * Mantém a renovação automática do Supabase ativa em todas as telas internas.
 * Ao voltar para uma aba que ficou em segundo plano, valida/renova a sessão
 * antes de atualizações de dados poderem chegar ao servidor.
 */
export function SessionKeepAlive() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  useEffect(() => {
    const ensureFreshSession = () => {
      void supabase.auth.getSession().then(({ error }) => {
        if (error) {
          console.warn("[auth] Não foi possível renovar a sessão agora.", error);
        }
      });
    };

    ensureFreshSession();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") ensureFreshSession();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [supabase]);

  return null;
}
