import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  AUTHENTICATED_HOME,
  isLegacyPortalPath,
  isPublicPath,
} from "@/lib/auth/paths";

function redirectTo(request: NextRequest, pathname: string, search = "") {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = search;
  if (
    url.pathname === request.nextUrl.pathname &&
    url.search === request.nextUrl.search
  ) {
    return null;
  }
  return NextResponse.redirect(url);
}

function stamp(response: NextResponse, pathname: string) {
  response.headers.set("x-casa-rev", "3");
  response.headers.set("x-casa-path", pathname);
  return response;
}

function isAssetPath(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/brand") ||
    pathname.startsWith("/icons") ||
    pathname.startsWith("/images") ||
    pathname === "/manifest.json" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname.includes(".")
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { response, user } = await updateSession(request);
  stamp(response, pathname);

  if (isAssetPath(pathname) || isPublicPath(pathname)) {
    return response;
  }

  if (!user) {
    // /app e /unauthorized ficam na página. O gate do cliente manda para o
    // login se a sessão não existir. Redirecionar aqui, com a sessão só no
    // browser, entra em ciclo e a tela fica branca.
    if (pathname === "/app" || pathname.startsWith("/app/") || pathname === "/unauthorized") {
      return response;
    }
    const next = isLegacyPortalPath(pathname) ? AUTHENTICATED_HOME : pathname;
    const redirect = redirectTo(
      request,
      "/login",
      `?next=${encodeURIComponent(next)}`,
    );
    return redirect ? stamp(redirect, pathname) : response;
  }

  // B3.2 / C038: portais legados — paciente vai para /app/portal; demais para /app
  if (isLegacyPortalPath(pathname)) {
    const redirect = redirectTo(
      request,
      pathname === "/paciente" || pathname.startsWith("/paciente/")
        ? "/app/portal"
        : AUTHENTICATED_HOME,
    );
    return redirect ? stamp(redirect, pathname) : response;
  }

  return response;
}

export const config = {
  // Só rotas com sessão. /, /login e /auth ficam de fora: no VPS,
  // o middleware rodar nessas páginas basta para o Next responder 307.
  matcher: [
    "/app",
    "/app/:path*",
    "/medica",
    "/medica/:path*",
    "/secretaria",
    "/secretaria/:path*",
    "/gestao",
    "/gestao/:path*",
    "/paciente",
    "/paciente/:path*",
    "/unauthorized",
  ],
};
