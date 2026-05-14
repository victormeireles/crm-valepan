import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const protectedPrefixes = [
  "/dashboard",
  "/inbox",
  "/leads",
  "/pipeline",
  "/tasks",
  "/distributors",
  "/samples",
];

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

  let user: { id: string } | null = null;
  try {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    user = authUser ? { id: authUser.id } : null;
  } catch (e) {
    // Em instabilidade de rede (ECONNRESET/fetch failed), não quebrar a navegação com loop de login.
    // O app continuará e as páginas protegidas farão validação própria no server quando necessário.
    console.warn("[middleware] supabase.auth.getUser falhou; seguindo sem redirect.", e);
    return response;
  }

  const path = request.nextUrl.pathname;
  const isProtected = protectedPrefixes.some((p) => path.startsWith(p));

  if (isProtected && !user) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", path);
    return NextResponse.redirect(redirectUrl);
  }

  if (path === "/login" && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
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
