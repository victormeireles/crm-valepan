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

  function getAuthErrorMessage(err: unknown) {
    if (err instanceof Error) {
      const msg = err.message.trim();
      if (
        msg === "Failed to fetch" ||
        msg.toLowerCase().includes("fetch failed")
      ) {
        return "Sem conexão com o servidor de autenticação. Verifique internet, VPN/firewall e tente novamente.";
      }
      return msg;
    }
    return "Erro inesperado ao autenticar.";
  }

  async function signInWithTimeout(email: string, password: string) {
    const supabase = createBrowserSupabaseClient();
    const authPromise = supabase.auth.signInWithPassword({ email, password });
    const timeoutPromise = new Promise<never>((_, reject) => {
      const id = setTimeout(() => {
        clearTimeout(id);
        reject(
          new Error(
            "Login demorou mais do que o esperado. Verifique sua conexão e tente novamente.",
          ),
        );
      }, 15000);
    });
    return Promise.race([authPromise, timeoutPromise]);
  }

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
    try {
      const { error: err } = await signInWithTimeout(email, password);
      if (err) {
        setError(getAuthErrorMessage(err));
        return;
      }
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
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
