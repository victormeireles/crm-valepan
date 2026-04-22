"use client";

import { usernameToLoginEmail } from "@/lib/auth/login-email";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") ?? "/dashboard";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    let email: string;
    try {
      email = usernameToLoginEmail(username);
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Usuário inválido.");
      return;
    }
    const supabase = createBrowserSupabaseClient();
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-8">
      <div>
        <h1 className="text-xl font-semibold">Entrar</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Informe usuário e senha cadastrados no CRM.
        </p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Usuário
          <input
            className="rounded border border-[var(--border)] bg-[var(--card)] px-3 py-2"
            type="text"
            autoComplete="username"
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Senha
          <input
            className="rounded border border-[var(--border)] bg-[var(--card)] px-3 py-2"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
