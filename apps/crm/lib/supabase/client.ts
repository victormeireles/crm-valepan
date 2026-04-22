"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY (carregados do .env.local na raiz do monorepo)",
    );
  }
  return createBrowserClient<Database>(url, anon);
}

export function crmTables(client: ReturnType<typeof createBrowserSupabaseClient>) {
  return client.schema("crm");
}
