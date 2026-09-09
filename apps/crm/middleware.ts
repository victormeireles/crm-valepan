import { createServerClient } from "@supabase/ssr";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import {
  isProtectedRoute,
  requestReturnPath,
  safeAuthenticatedPath,
} from "@/lib/auth/session-navigation";

function redirectWithResponseCookies(destination: URL, response: NextResponse) {
  const redirectResponse = NextResponse.redirect(destination);
  response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
  return redirectResponse;
}

export async function middleware(request: NextRequest) {
  // Passar o `request` inteiro — não `{ headers }` só — para o Next preservar
  // headers internos (RSC / router state). Objeto parcial causa 500 em rotas dinâmicas.
  let response = NextResponse.next({ request });
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return response;
  }

  const path = request.nextUrl.pathname;
  const isProtected = isProtectedRoute(path);

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options as never),
        );
      },
    },
  });

  let isAuthenticated = false;
  try {
    // getClaims renova uma sessão vencendo e, com chaves assimétricas, valida o
    // JWT localmente. Isso preserva os cookies sem impor uma chamada remota em
    // toda navegação, que era o problema de desempenho da implementação antiga.
    const { data, error } = await supabase.auth.getClaims();
    if (error) {
      if (isAuthRetryableFetchError(error)) {
        console.warn("[middleware] autenticação indisponível temporariamente; mantendo a rota.", error);
        return response;
      }
    } else {
      isAuthenticated = Boolean(data?.claims?.sub);
    }
  } catch (e) {
    // Uma falha de rede não deve transformar uma atualização silenciosa em
    // troca de tela. A rota atual continua e pode tentar novamente depois.
    console.warn("[middleware] validação da sessão falhou; mantendo a rota.", e);
    return response;
  }

  if (isProtected && !isAuthenticated) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", requestReturnPath(request.nextUrl));
    return redirectWithResponseCookies(redirectUrl, response);
  }

  if (path === "/login" && isAuthenticated) {
    const destination = safeAuthenticatedPath(request.nextUrl.searchParams.get("next"));
    return redirectWithResponseCookies(new URL(destination, request.url), response);
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/inbox",
    "/inbox/:path*",
    "/leads/:path*",
    "/pipeline/:path*",
    "/tasks/:path*",
    "/distributors/:path*",
    "/samples/:path*",
    "/login",
  ],
};
