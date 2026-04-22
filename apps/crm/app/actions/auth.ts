"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function signOutAction() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}
