import { createServerClient } from "@supabase/ssr";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cache } from "react";
import type { Database } from "@/lib/database.types";

async function createServerSupabaseClientUncached() {
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

/**
 * Reutiliza o cliente durante uma mesma renderização do servidor. Layout e
 * página são executados separadamente pelo React e, sem esse cache por
 * requisição, repetiam a leitura dos cookies e a validação da sessão.
 */
export const createServerSupabaseClient = cache(createServerSupabaseClientUncached);

/** Valida a sessão no máximo uma vez por renderização do servidor. */
export const getServerUser = cache(async () => {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  // Não confundir uma oscilação do serviço de autenticação com logout. Em uma
  // atualização do App Router, lançar o erro mantém a URL/tela em vez de mandar
  // o usuário ao login e, depois, ao Dashboard.
  if (error && isAuthRetryableFetchError(error)) throw error;
  return user;
});

/** Acesso às tabelas do schema `crm` via PostgREST. */
export function crmTables(client: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  return client.schema("crm");
}
