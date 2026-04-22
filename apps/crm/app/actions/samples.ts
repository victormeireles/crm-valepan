"use server";

import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createSample(formData: FormData) {
  const item = String(formData.get("item") ?? "").trim();
  if (!item) return { ok: false as const, error: "Item obrigatório" };

  const supabase = await createServerSupabaseClient();
  const crm = crmTables(supabase);

  const { data: ship, error } = await crm
    .from("sample_shipments")
    .insert({
      contact_name: String(formData.get("contact_name") ?? "").trim() || null,
      address_line: String(formData.get("address_line") ?? "").trim() || null,
      status: "requested",
    })
    .select("id")
    .single();

  if (error || !ship) return { ok: false as const, error: error?.message ?? "Erro" };

  await crm.from("sample_items").insert({
    shipment_id: ship.id,
    description: item,
    qty: 1,
  });

  revalidatePath("/samples");
  revalidatePath("/dashboard");
  return { ok: true as const };
}
