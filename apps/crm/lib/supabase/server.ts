import "@/lib/load-monorepo-env";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY (ou SUPABASE_URL / SUPABASE_ANON_KEY) na raiz do monorepo em .env.local",
    );
  }
  return createServerClient<Database>(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options as never),
          );
        } catch {
          /* Server Component — cookies read-only em alguns contextos */
        }
      },
    },
  });
}

/** Acesso às tabelas do schema `crm` via PostgREST. */
export function crmTables(client: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  return client.schema("crm");
}
