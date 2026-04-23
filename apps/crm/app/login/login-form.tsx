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
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG em public */}
      <img
        src="/brand/valepan-logo-full.svg"
        alt="Valepan"
        className="mx-auto mb-6 block h-auto w-[min(100%,220px)]"
        width={220}
        height={157}
      />
      <div className="w-full rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--card)] p-6 shadow-[var(--sh-md)]">
      <div className="mb-6">
        <h1
          className="text-3xl font-normal uppercase tracking-wide text-[var(--vp-wine)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Entrar
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Informe usuário e senha cadastrados no CRM.
        </p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-[var(--foreground)]">
          Usuário
          <input
            className="rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--vp-paper-pure)] px-3 py-2 text-[var(--foreground)]"
            type="text"
            autoComplete="username"
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-[var(--foreground)]">
          Senha
          <input
            className="rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--vp-paper-pure)] px-3 py-2 text-[var(--foreground)]"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error ? (
          <p className="text-sm text-[var(--vp-error)]">{error}</p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="rounded-[var(--r-lg)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--vp-gold)] disabled:opacity-60"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
      </div>
    </>
  );
}
