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
    <div className="flex min-h-screen flex-col bg-[var(--vp-paper)]">
      <header className="shrink-0 border-b border-[rgba(199,166,77,0.35)] bg-[var(--vp-wine)] shadow-[0_8px_28px_rgba(35,0,4,0.35)]">
        <div className="mx-auto flex min-h-[var(--header-height)] max-w-[min(100%,var(--container-wide))] flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-4 md:gap-6">
            <Link
              href="/dashboard"
              className="inline-flex min-h-11 shrink-0 items-center gap-2.5 rounded-md p-1 text-[var(--vp-gold)] outline-offset-2 transition-opacity hover:opacity-90"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- SVG local em public */}
              <img
                src="/brand/valepan-logo.svg"
                alt="Valepan"
                className="h-9 w-auto drop-shadow-sm"
                width={40}
                height={37}
              />
              <span
                className="text-xl font-bold tracking-[0.12em] text-[var(--vp-gold)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                CRM
              </span>
            </Link>
            <DashboardNav />
          </div>
          <div className="flex items-center border-l border-[rgba(255,248,247,0.2)] pl-4 md:pl-5">
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[rgba(255,248,247,0.08)] px-3 py-2 text-sm backdrop-blur-sm">
              <span className="text-[rgba(255,248,247,0.88)]">
                {displayUserLabel(user, profile)}{" "}
                {profile?.role
                  ? `· ${roleLabel[profile.role] ?? profile.role}`
                  : ""}
              </span>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="rounded-lg border border-[rgba(255,215,115,0.45)] px-3 py-1.5 text-xs font-semibold text-[var(--vp-gold)] transition-colors duration-200 hover:bg-[rgba(255,248,247,0.12)]"
                >
                  Sair
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>
      <div className="mx-auto flex min-h-0 w-full max-w-[min(100%,var(--container-wide))] flex-1 flex-col px-4 py-6 md:py-8">
        {children}
      </div>
    </div>
  );
}
