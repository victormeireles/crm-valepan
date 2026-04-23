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
      <header className="bg-[var(--background)] shadow-[var(--sh-sm)]">
        <div className="mx-auto flex min-h-[var(--header-height)] max-w-[min(100%,var(--container-wide))] flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-5">
            <Link
              href="/dashboard"
              className="inline-flex min-h-11 shrink-0 items-center gap-2.5 rounded-md p-1 text-[var(--vp-wine)] outline-offset-2 transition-opacity hover:opacity-90"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- SVG local em public */}
              <img
                src="/brand/valepan-logo.svg"
                alt="Valepan"
                className="h-9 w-auto"
                width={40}
                height={37}
              />
              <span className="text-lg font-extrabold tracking-tight">CRM</span>
            </Link>
            <DashboardNav />
          </div>
          <div className="flex items-center border-l border-[var(--border)] pl-4 md:pl-5">
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-[var(--vp-surface-low)] px-3 py-2 text-sm">
              <span className="text-[var(--muted)]">
                {displayUserLabel(user, profile)}{" "}
                {profile?.role
                  ? `· ${roleLabel[profile.role] ?? profile.role}`
                  : ""}
              </span>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="rounded-md border border-[color:var(--border-strong)] px-3 py-1.5 text-[var(--foreground)] transition-colors duration-200 hover:bg-[var(--vp-paper-pure)]"
                >
                  Sair
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-[min(100%,var(--container-wide))] px-4 py-6 md:py-8">
        {children}
      </div>
    </div>
  );
}
