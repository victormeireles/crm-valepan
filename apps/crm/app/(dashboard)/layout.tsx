import { displayUserLabel } from "@/lib/auth/display-user-label";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/actions/auth";

const roleLabel: Record<string, string> = {
  admin: "Administrador",
  comercial: "Comercial",
  gestao: "Gestão",
  operacao: "Operação",
};

const nav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/inbox", label: "Inbox" },
  { href: "/leads", label: "Leads" },
  { href: "/pipeline", label: "Funil" },
  { href: "/tasks", label: "Tarefas" },
  { href: "/distributors", label: "Distribuidores" },
  { href: "/samples", label: "Amostras" },
];

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
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/dashboard" className="font-semibold">
              CRM Valepan
            </Link>
            <nav className="flex flex-wrap gap-2 text-sm">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="rounded px-2 py-1 text-[var(--muted)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
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
                className="rounded border border-[var(--border)] px-2 py-1 hover:bg-[var(--background)]"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}
