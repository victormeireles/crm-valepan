import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  crmTables,
  getServerUser,
} from "@/lib/supabase/server";
import { fetchZapiProfilePictureLink } from "@/lib/zapi/profile-picture";

export const dynamic = "force-dynamic";

function usableAvatarUrl(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  if (!text || text === "null" || text === "undefined") return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function imageUnavailable() {
  return new NextResponse(null, {
    status: 404,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(request: Request) {
  const user = await getServerUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const requestUrl = new URL(request.url);
  const phone = requestUrl.searchParams.get("phone")?.trim() ?? "";
  const forceRefresh = requestUrl.searchParams.get("refresh") === "1";
  if (!/^\+\d{8,15}$/.test(phone)) return imageUnavailable();

  const supabase = await createServerSupabaseClient();
  const crm = crmTables(supabase);
  const { data: contact, error } = await crm
    .from("contacts")
    .select("id, avatar_url, avatar_updated_at")
    .eq("phone_e164", phone)
    .maybeSingle();

  if (error || !contact) return imageUnavailable();

  let avatarUrl = usableAvatarUrl(contact.avatar_url);
  if (forceRefresh) {
    const refreshedUrl = usableAvatarUrl(await fetchZapiProfilePictureLink(phone));
    const refreshedAt = new Date().toISOString();

    await crm
      .from("contacts")
      .update({
        ...(refreshedUrl ? { avatar_url: refreshedUrl } : {}),
        avatar_updated_at: refreshedAt,
      })
      .eq("id", contact.id);

    avatarUrl = refreshedUrl ?? avatarUrl;
  }

  if (!avatarUrl) return imageUnavailable();

  return NextResponse.redirect(avatarUrl, {
    status: 307,
    headers: {
      "Cache-Control": "private, max-age=86400, stale-while-revalidate=3600",
    },
  });
}
