import { displayUserLabel } from "@/lib/auth/display-user-label";
import { createServerSupabaseClient, crmTables, getServerUser } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/actions/auth";
import { DashboardNav } from "./dashboard-nav";
import { SessionKeepAlive } from "@/lib/auth/session-keep-alive";

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
  const user = await getServerUser();
  if (!user) redirect("/login");

  const crm = crmTables(supabase);
  const { data: profile, error: profileError } = await crm
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[var(--vp-paper)]">
      <SessionKeepAlive />
      <header className="shrink-0 border-b border-[rgba(199,166,77,0.35)] bg-[var(--vp-wine)] shadow-[0_8px_28px_rgba(35,0,4,0.35)]">
        <div className="mx-auto flex min-h-[var(--header-height)] w-full items-center justify-between gap-3 px-4 py-3 lg:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3 md:gap-5">
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
            <DashboardNav isAdmin={profile?.role === "admin"} />
          </div>
          <div className="flex shrink-0 items-center gap-3 border-l border-[rgba(255,248,247,0.2)] pl-3 md:pl-5">
            <div className="flex items-center gap-3 rounded-xl bg-[rgba(255,248,247,0.08)] px-3 py-2 text-sm backdrop-blur-sm">
              <span className="max-w-[12rem] truncate whitespace-nowrap text-[rgba(255,248,247,0.88)] xl:max-w-none">
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
      <div
        data-dashboard-main
        className="relative mx-auto flex min-h-0 w-full flex-1 flex-col overflow-y-auto px-4 py-6 lg:px-6 md:py-8"
      >
        {profileError ? (
          <div className="mx-auto max-w-lg rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
            <h1 className="text-lg font-semibold">Não foi possível abrir o CRM</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              O perfil não carregou. Atualize a página. Se continuar, saia e entre de novo.
            </p>
          </div>
        ) : profile ? (
          children
        ) : (
          <div className="mx-auto max-w-lg rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
            <h1 className="text-lg font-semibold">Sem acesso ao CRM</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Sua conta entrou, mas ainda não tem um perfil liberado. Um administrador precisa autorizar o acesso.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
