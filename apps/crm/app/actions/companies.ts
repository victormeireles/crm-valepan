"use server";

import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";

function sanitizeIlikeFragment(value: string) {
  return value.replace(/[%_]/g, "").trim();
}

/** Cidades já usadas em `crm.companies`, para autocomplete na qualificação. */
export async function searchCompanyCities(input: {
  q: string;
  state?: string | null;
}) {
  const q = sanitizeIlikeFragment(input.q);
  if (q.length < 2) {
    return { ok: true as const, cities: [] as string[] };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };

  const crm = crmTables(supabase);
  let query = crm
    .from("companies")
    .select("city, state")
    .not("city", "is", null)
    .neq("city", "")
    .ilike("city", `%${q}%`)
    .order("city", { ascending: true })
    .limit(50);

  const state = sanitizeIlikeFragment(String(input.state ?? "")).toUpperCase();
  if (state.length >= 2) {
    query = query.ilike("state", state);
  }

  const { data, error } = await query;
  if (error) return { ok: false as const, error: error.message };

  const seen = new Set<string>();
  const cities: string[] = [];
  for (const row of data ?? []) {
    const city = (row.city ?? "").trim();
    if (!city) continue;
    const key = city.toLocaleLowerCase("pt-BR");
    if (seen.has(key)) continue;
    seen.add(key);
    cities.push(city);
    if (cities.length >= 12) break;
  }

  return { ok: true as const, cities };
}
