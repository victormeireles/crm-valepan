import { loadEnvConfig } from "@next/env";
import fs from "node:fs";
import path from "node:path";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Garante leitura do `.env.local` da raiz do monorepo mesmo quando `cwd` varia
 * (ex.: Turbopack / workers com cwd diferente de `apps/crm`).
 */
function tryLoad(dir: string) {
  if (!fs.existsSync(path.join(dir, ".env.local"))) return;
  loadEnvConfig(dir, isDev);
}

const cwd = process.cwd();
const candidates = [
  cwd,
  path.resolve(cwd, ".."),
  path.resolve(cwd, "..", ".."),
  path.resolve(cwd, "..", "..", ".."),
];

for (const dir of candidates) {
  tryLoad(dir);
}
