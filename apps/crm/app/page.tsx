import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">CRM Valepan</h1>
      <p className="text-[var(--muted)]">
        Acesse o painel para inbox, leads e funil comercial.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/login"
          className="inline-flex w-fit rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium"
        >
          Entrar
        </Link>
        <Link
          href="/dashboard"
          className="inline-flex w-fit rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
        >
          Dashboard
        </Link>
      </div>
    </main>
  );
}
