export const PROTECTED_ROUTE_PREFIXES = [
  "/dashboard",
  "/inbox",
  "/leads",
  "/pipeline",
  "/tasks",
  "/distributors",
  "/samples",
] as const;

const DEFAULT_AUTHENTICATED_PATH = "/dashboard";
const CRM_ORIGIN = "https://crm.valepan.local";

/** Evita que prefixos parecidos (como `/pipeline-old`) sejam tratados como rotas protegidas. */
export function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Mantém a tela, os filtros e a seleção presentes na URL antes de pedir novo login. */
export function requestReturnPath(url: Pick<URL, "pathname" | "search">): string {
  return `${url.pathname}${url.search}`;
}

/**
 * Aceita somente destinos internos. Além de impedir redirecionamentos externos,
 * bloqueia um retorno para o próprio login, que causaria um loop.
 */
export function safeAuthenticatedPath(
  candidate: string | null | undefined,
  fallback = DEFAULT_AUTHENTICATED_PATH,
): string {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return fallback;
  }

  try {
    const parsed = new URL(candidate, CRM_ORIGIN);
    if (parsed.origin !== CRM_ORIGIN || parsed.pathname === "/login") {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
