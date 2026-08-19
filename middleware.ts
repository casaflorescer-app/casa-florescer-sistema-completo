import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/middleware";
import {
  PREVIEW_ACL_COOKIE,
  PREVIEW_COOKIE,
  canAccessPath,
  homeForRole,
  parsePreviewRole,
  previewSession,
} from "./lib/rbac";
import { normalizeModules, type ModuleId } from "./lib/permissions";

const PUBLIC_PREFIXES = [
  "/login",
  "/auth",
  "/brand",
  "/icons",
  "/api/preview-role",
  "/api/preview-acl",
  "/manifest.webmanifest",
  "/sw.js",
];

function aclFromRequest(request: NextRequest): Record<string, ModuleId[]> {
  const raw = request.cookies.get(PREVIEW_ACL_COOKIE)?.value;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, ModuleId[]> = {};
    for (const [key, value] of Object.entries(parsed)) {
      out[key] = normalizeModules(value, []);
    }
    return out;
  } catch {
    return {};
  }
}

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
  if (!preview) return response;

  const session = previewSession(preview, aclFromRequest(request));
  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = homeForRole(preview, session.permissions);
    return NextResponse.redirect(url);
  }

  if (!canAccessPath(preview, pathname, session.permissions)) {
    const url = request.nextUrl.clone();
    url.pathname = homeForRole(preview, session.permissions);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
