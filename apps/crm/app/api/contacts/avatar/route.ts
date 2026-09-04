import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  crmTables,
  getServerUser,
} from "@/lib/supabase/server";
import { fetchZapiProfilePictureLink } from "@/lib/zapi/profile-picture";

export const dynamic = "force-dynamic";

const AVATAR_REFRESH_MS = 24 * 60 * 60 * 1000;

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

function isFresh(value: string | null | undefined): boolean {
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) && Date.now() - timestamp < AVATAR_REFRESH_MS;
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
  if (forceRefresh || !isFresh(contact.avatar_updated_at)) {
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
      "Cache-Control": "private, max-age=3600, stale-while-revalidate=300",
    },
  });
}
