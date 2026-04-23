import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `process.cwd()` é `apps/crm` ao rodar via `scripts/run-in-app.cjs`.
 * Carrega `.env*` da raiz do monorepo e de `apps/crm` (segundo sobrescreve).
 * O 2º argumento `dev` habilita `.env.local` em desenvolvimento.
 */
const appDir = process.cwd();
const monorepoRoot = path.resolve(appDir, "..", "..");
/** Raiz do monorepo a partir deste ficheiro (evita cwd errado). Usado pelo Turbopack. */
const configDir = path.dirname(fileURLToPath(import.meta.url));
const turbopackRoot = path.resolve(configDir, "..", "..");
const isDev = process.env.NODE_ENV !== "production";
loadEnvConfig(monorepoRoot, isDev);
loadEnvConfig(appDir, isDev);

/** Alias para o formato esperado pelo Next (middleware / browser / RSC). Chave anon é pública por desenho no Supabase. */
const resolvedPublicUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const resolvedPublicAnon =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  "";

const nextConfig: NextConfig = {
  /** Evita aviso "multiple lockfiles" e raiz inferida como `C:\Users\...\` com Turbopack. */
  turbopack: {
    root: turbopackRoot,
  },
  transpilePackages: ["@crm/shared"],
  env: {
    ...(resolvedPublicUrl ? { NEXT_PUBLIC_SUPABASE_URL: resolvedPublicUrl } : {}),
    ...(resolvedPublicAnon
      ? { NEXT_PUBLIC_SUPABASE_ANON_KEY: resolvedPublicAnon }
      : {}),
  },
};

export default nextConfig;
