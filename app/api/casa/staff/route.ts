import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hash } from "argon2";
import { z } from "zod";
import { openCasaSession } from "@/lib/auth/casa-session";
import { casaSessionActive, createStaffAccount, isCasaDatabaseConfigured } from "@/lib/db/casa";

export const runtime = "nodejs";

const membershipSchema = z.object({
  practiceId: z.string().uuid(),
  role: z.enum(["admin", "physician", "secretary"]),
  canScheduleAnyPractice: z.boolean().optional(),
});

const bodySchema = z.object({
  email: z.string().trim().email().max(320),
  fullName: z.string().trim().min(2).max(160),
  password: z.string().min(8).max(200),
  organizationId: z.string().uuid(),
  memberships: z.array(membershipSchema).min(1).max(8),
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
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }

  try {
    const passwordHash = await hash(parsed.data.password);
    const id = await createStaffAccount(session.userId, {
      email: parsed.data.email,
      fullName: parsed.data.fullName,
      passwordHash,
      organizationId: parsed.data.organizationId,
      memberships: parsed.data.memberships,
    });
    return NextResponse.json({ id });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível criar o usuário." },
      { status: 403 },
    );
  }
}
