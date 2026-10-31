import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hash, verify } from "argon2";
import { z } from "zod";
import { openCasaSession } from "@/lib/auth/casa-session";
import {
  casaSessionActive,
  isCasaDatabaseConfigured,
  replaceStaffPassword,
  staffPasswordHash,
} from "@/lib/db/casa";

export const runtime = "nodejs";

const bodySchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

export async function POST(request: Request) {
  if (!isCasaDatabaseConfigured() || !process.env.CASA_SESSION_SECRET) {
    return NextResponse.json(
      { error: "A sessão da casa ainda não está ligada neste processo." },
      { status: 503 },
    );
  }

  const session = await openCasaSession(cookies().get("casa_session")?.value);
  if (!session) return NextResponse.json({ error: "Sem sessão." }, { status: 401 });
  const active = await casaSessionActive(session.sessionId);
  if (active !== session.userId) {
    return NextResponse.json({ error: "Sem sessão." }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Informe a senha atual e uma senha nova." }, { status: 400 });
  }

  try {
    const currentHash = await staffPasswordHash(session.userId);
    if (!currentHash?.startsWith("$argon2id$")) {
      return NextResponse.json({ error: "Não foi possível trocar a senha." }, { status: 401 });
    }
    const matches = await verify(currentHash, parsed.data.currentPassword);
    if (!matches) {
      return NextResponse.json({ error: "Não foi possível trocar a senha." }, { status: 401 });
    }
    const nextHash = await hash(parsed.data.newPassword);
    await replaceStaffPassword(session.userId, nextHash);
    const response = NextResponse.json({ ok: true });
    response.cookies.set("casa_session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Não foi possível trocar a senha." }, { status: 500 });
  }
}
