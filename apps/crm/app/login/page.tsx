import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center bg-[var(--background)] p-8">
      <Suspense
        fallback={
          <p className="text-center text-sm text-[var(--muted)]">Carregando…</p>
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}
