import { NextResponse } from "next/server";
import { hash } from "argon2";
import { z } from "zod";
import { hashPasswordResetToken } from "@/lib/auth/password-reset-token";
import { finishPasswordReset, isCasaDatabaseConfigured } from "@/lib/db/casa";

export const runtime = "nodejs";

const bodySchema = z.object({
  token: z.string().min(32).max(200),
  newPassword: z.string().min(8).max(200),
});

export async function POST(request: Request) {
  if (!isCasaDatabaseConfigured()) {
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
    return NextResponse.json(
      { error: "Informe o código e uma senha nova com pelo menos 8 caracteres." },
      { status: 400 },
    );
  }

  try {
    const nextHash = await hash(parsed.data.newPassword);
    await finishPasswordReset(hashPasswordResetToken(parsed.data.token), nextHash);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível redefinir a senha." },
      { status: 401 },
    );
  }
}
