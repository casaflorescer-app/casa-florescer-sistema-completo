import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verify as verifyArgon2 } from "argon2";
import { z } from "zod";
import {
  COOKIE_NAME,
  casaSessionCookieOptions,
  openCasaSession,
  sealCasaSession,
} from "@/lib/auth/casa-session";
import {
  casaSessionActive,
  isCasaDatabaseConfigured,
  revokeCasaSession,
  staffLoginHash,
  startCasaSession,
} from "@/lib/db/casa";

export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(200),
});

const DUMMY_HASH =
  "$argon2id$v=19$m=65536,p=4,t=3$TttiOpXLHcVv5GRtYwQBlQ$B7dSs8sU0KQw9wLnF+aDR89Ze8ycsOGBck2EAOiLEs4";

function refused() {
  return NextResponse.json(
    { error: "Não foi possível entrar. Tente novamente." },
    { status: 401 },
  );
}

export async function POST(request: Request) {
  if (!isCasaDatabaseConfigured() || !process.env.CASA_SESSION_SECRET) {
    return NextResponse.json(
      { error: "A sessão da casa ainda não está ligada neste processo." },
      { status: 503 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 400 });
  }

  try {
    const row = await staffLoginHash(parsed.data.email.toLowerCase());
    const hash = row?.password_hash.startsWith("$argon2id$")
      ? row.password_hash
      : DUMMY_HASH;
    const matches = await verifyArgon2(hash, parsed.data.password);
    if (!row || !matches) return refused();
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 12 * 1000);
    await startCasaSession(sessionId, row.user_id, expiresAt);
    const token = await sealCasaSession(row.user_id, sessionId);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(COOKIE_NAME, token, casaSessionCookieOptions());
    return response;
  } catch {
    return NextResponse.json(
      { error: "Não foi possível entrar. Tente novamente." },
      { status: 500 },
    );
  }
}

export async function GET() {
  const session = await openCasaSession(cookies().get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Sem sessão." }, { status: 401 });
  const active = await casaSessionActive(session.sessionId);
  if (active !== session.userId) {
    return NextResponse.json({ error: "Sem sessão." }, { status: 401 });
  }
  return NextResponse.json({ id: session.userId });
}

export async function DELETE() {
  const session = await openCasaSession(cookies().get(COOKIE_NAME)?.value);
  if (session) await revokeCasaSession(session.sessionId);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, "", { ...casaSessionCookieOptions(), maxAge: 0 });
  return response;
}
