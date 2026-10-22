import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  AUTHENTICATED_HOME,
  isAuthEntryPath,
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

  if (isAssetPath(pathname)) {
    return response;
  }

  if (isPublicPath(pathname)) {
    if (user && (isAuthEntryPath(pathname) || pathname === "/")) {
      const redirect = redirectTo(request, AUTHENTICATED_HOME);
      return redirect ?? response;
    }
    return response;
  }

  if (!user) {
    const next = isLegacyPortalPath(pathname) ? AUTHENTICATED_HOME : pathname;
    const redirect = redirectTo(
      request,
      "/login",
      `?next=${encodeURIComponent(next)}`,
    );
    return redirect ?? response;
  }

  // B3.2 / C038: portais legados — paciente vai para /app/portal; demais para /app
  if (isLegacyPortalPath(pathname)) {
    const redirect = redirectTo(
      request,
      pathname === "/paciente" || pathname.startsWith("/paciente/")
        ? "/app/portal"
        : AUTHENTICATED_HOME,
    );
    return redirect ?? response;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
