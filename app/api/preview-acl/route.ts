import { NextResponse } from "next/server";
import { PREVIEW_ACL_COOKIE } from "@/lib/rbac";
import { normalizeModules, MODULE_IDS, type ModuleId } from "@/lib/permissions";

export async function POST(request: Request) {
  const body = (await request.json()) as { acl?: Record<string, unknown> };
  if (!body.acl || typeof body.acl !== "object") {
    return NextResponse.json({ error: "ACL inválida" }, { status: 400 });
  }
  const acl: Record<string, ModuleId[]> = {};
  for (const [userId, value] of Object.entries(body.acl)) {
    acl[userId] = normalizeModules(value, []);
  }
  const res = NextResponse.json({ ok: true, modules: MODULE_IDS.length });
  res.cookies.set(PREVIEW_ACL_COOKIE, JSON.stringify(acl), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}
