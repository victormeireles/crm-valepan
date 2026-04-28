"use server";

import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import { isSendViaOption } from "@/lib/send-via-options";
import { revalidatePath } from "next/cache";

const SAMPLE_STATUSES = ["PENDENTE", "ENVIADO"] as const;
export type SampleShipmentStatus = (typeof SAMPLE_STATUSES)[number];

export async function updateSampleShipmentStatus(input: { shipmentId: string; status: SampleShipmentStatus }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };

  if (!SAMPLE_STATUSES.includes(input.status)) {
    return { ok: false as const, error: "Status inválido." };
  }

  const crm = crmTables(supabase);

  const { data: updated, error } = await crm
    .from("sample_shipments")
    .update({
      status: input.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.shipmentId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false as const, error: error.message };
  if (!updated) return { ok: false as const, error: "Não foi possível atualizar o status." };

  revalidatePath("/samples");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

export async function updateSampleShipmentSendVia(input: { shipmentId: string; sendVia: string | null }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };

  const raw = input.sendVia?.trim() ?? "";
  const sendVia = raw.length === 0 ? null : raw;
  if (sendVia && !isSendViaOption(sendVia)) {
    return { ok: false as const, error: "Opção inválida para Enviar por." };
  }

  const crm = crmTables(supabase);

  const { data: updated, error } = await crm
    .from("sample_shipments")
    .update({
      send_via: sendVia,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.shipmentId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false as const, error: error.message };
  if (!updated) return { ok: false as const, error: "Não foi possível atualizar Enviar por." };

  revalidatePath("/samples");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

export async function updateSampleShipmentDetails(input: {
  shipmentId: string;
  leadId: string | null;
  network: string | null;
  contactName: string | null;
  leadPhone: string | null;
  addressLine: string | null;
  businessHours: string | null;
  breadType: string | null;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };

  const crm = crmTables(supabase);

  const network = input.network?.trim() || null;
  const contactName = input.contactName?.trim() || null;
  const leadPhone = input.leadPhone?.trim() || null;
  const addressLine = input.addressLine?.trim() || null;
  const businessHours = input.businessHours?.trim() || null;
  const breadType = input.breadType?.trim() || null;

  const { data: updatedShip, error: shipError } = await crm
    .from("sample_shipments")
    .update({
      network,
      contact_name: contactName,
      address_line: addressLine,
      business_hours: businessHours,
      bread_type: breadType,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.shipmentId)
    .select("id")
    .maybeSingle();

  if (shipError) return { ok: false as const, error: shipError.message };
  if (!updatedShip) return { ok: false as const, error: "Não foi possível salvar os dados da amostra." };

  if (input.leadId && leadPhone) {
    const { error: leadError } = await crm
      .from("leads")
      .update({
        phone_e164: leadPhone,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.leadId);
    if (leadError) return { ok: false as const, error: leadError.message };
  }

  revalidatePath("/samples");
  revalidatePath("/leads");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

export async function createSample(formData: FormData) {
  const breadType =
    String(formData.get("bread_type") ?? "").trim() ||
    String(formData.get("item") ?? "").trim();
  if (!breadType) return { ok: false as const, error: "Tipo de pão obrigatório" };

  const supabase = await createServerSupabaseClient();
  const crm = crmTables(supabase);

  const sendViaRaw = String(formData.get("send_via") ?? "").trim();
  const sendVia = sendViaRaw.length === 0 ? null : sendViaRaw;
  if (sendVia && !isSendViaOption(sendVia)) {
    return { ok: false as const, error: "Opção inválida para Enviar por." };
  }

  const { data: ship, error } = await crm
    .from("sample_shipments")
    .insert({
      contact_name: String(formData.get("contact_name") ?? "").trim() || null,
      address_line: String(formData.get("address_line") ?? "").trim() || null,
      send_via: sendVia,
      network: String(formData.get("network") ?? "").trim() || null,
      business_hours: String(formData.get("business_hours") ?? "").trim() || null,
      bread_type: breadType,
      status: "PENDENTE",
    })
    .select("id")
    .single();

  if (error || !ship) return { ok: false as const, error: error?.message ?? "Erro" };

  await crm.from("sample_items").insert({
    shipment_id: ship.id,
    description: breadType,
    qty: 1,
  });

  revalidatePath("/samples");
  revalidatePath("/dashboard");
  return { ok: true as const };
}
