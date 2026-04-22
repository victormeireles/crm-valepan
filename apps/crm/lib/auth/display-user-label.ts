import type { User } from "@supabase/supabase-js";
import { CRM_LOGIN_EMAIL_DOMAIN } from "@/lib/auth/login-email";

/** Rótulo amigável no shell (evita mostrar e-mail sintético de login por usuário). */
export function displayUserLabel(
  user: User,
  profile?: { full_name: string | null } | null,
): string {
  const fn = profile?.full_name?.trim();
  if (fn) return fn;

  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const u = meta?.username;
  if (typeof u === "string" && u.trim()) return u.trim();
  const mfn = meta?.full_name;
  if (typeof mfn === "string" && mfn.trim()) return mfn.trim();

  const email = user.email ?? "";
  const at = email.lastIndexOf("@");
  if (at > 0 && email.slice(at + 1) === CRM_LOGIN_EMAIL_DOMAIN) {
    return email.slice(0, at);
  }

  return email || "Usuário";
}
