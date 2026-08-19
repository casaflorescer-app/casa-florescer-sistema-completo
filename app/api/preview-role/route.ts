import { NextResponse } from "next/server";
import { parsePreviewRole, PREVIEW_COOKIE } from "@/lib/rbac";

export async function POST(request: Request) {
  const body = (await request.json()) as { role?: string };
  const role = parsePreviewRole(body.role);
  if (!role) {
    return NextResponse.json({ error: "Perfil inválido" }, { status: 400 });
  }
  const res = NextResponse.json({ ok: true, role });
  res.cookies.set(PREVIEW_COOKIE, role, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PREVIEW_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
