import { NextResponse } from "next/server";
import { z } from "zod";
import { isCasaDatabaseConfigured } from "@/lib/db/casa";

export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().trim().email().max(320),
});

const accepted = {
  ok: true,
  message:
    "Se este e-mail estiver cadastrado, você receberá as instruções para redefinir a senha.",
};

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
    return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 400 });
  }

  // O registro do token existe no banco. Sem cliente de e-mail, gravar o
  // código deixaria uma redefinição que ninguém consegue abrir.
  void parsed.data.email;
  return NextResponse.json(accepted);
}
