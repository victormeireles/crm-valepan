import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/** Cliente com SERVICE_ROLE — apenas servidor (webhooks, jobs). Ignora RLS. */
export function createAdminSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE;
  if (!url || !key) {
    throw new Error(
      "Defina NEXT_PUBLIC_SUPABASE_URL (ou SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY (ou SERVICE_ROLE)",
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function crmTables(client: ReturnType<typeof createAdminSupabaseClient>) {
  return client.schema("crm");
}
