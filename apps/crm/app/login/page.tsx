import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-8 text-sm text-[var(--muted)]">
          Carregando…
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
