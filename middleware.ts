import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/middleware";
import { canAccessPath, parsePreviewRole, PREVIEW_COOKIE } from "./lib/rbac";

const PUBLIC_PREFIXES = ["/login", "/auth", "/brand", "/api/preview-role"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    return updateSession(request);
  }

  const response = await updateSession(request);
  const preview = parsePreviewRole(request.cookies.get(PREVIEW_COOKIE)?.value);

  if (pathname === "/") {
    if (preview) {
      const url = request.nextUrl.clone();
      url.pathname =
        preview === "physician"
          ? "/medica"
          : preview === "secretary"
            ? "/secretaria"
            : preview === "manager"
              ? "/gestao"
              : "/paciente";
      return NextResponse.redirect(url);
    }
    return response;
  }

  if (preview && !canAccessPath(preview, pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
