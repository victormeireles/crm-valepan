import { displayUserLabel } from "@/lib/auth/display-user-label";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/actions/auth";
import { DashboardNav } from "./dashboard-nav";

const roleLabel: Record<string, string> = {
  admin: "Administrador",
  comercial: "Comercial",
  gestao: "Gestão",
  operacao: "Operação",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const crm = crmTables(supabase);
  const { data: profile } = await crm
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-[color:var(--border-strong)] bg-[var(--background)]">
        <div className="mx-auto flex min-h-[var(--header-height)] max-w-[min(100%,var(--container-wide))] flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/dashboard"
              className="text-base font-extrabold tracking-tight text-[var(--vp-wine)]"
            >
              CRM Valepan
            </Link>
            <DashboardNav />
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-[var(--muted)]">
              {displayUserLabel(user, profile)}{" "}
              {profile?.role
                ? `· ${roleLabel[profile.role] ?? profile.role}`
                : ""}
            </span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-md border border-[color:var(--border-strong)] px-3 py-1.5 text-[var(--foreground)] transition-colors duration-200 hover:bg-[var(--vp-surface-low)]"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-[min(100%,var(--container-wide))] px-4 py-6">
        {children}
      </div>
    </div>
  );
}
