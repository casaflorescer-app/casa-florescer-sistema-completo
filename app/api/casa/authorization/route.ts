import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { openCasaSession } from "@/lib/auth/casa-session";
import { loadCasaAuthorization } from "@/lib/auth/casa-authorization";
import { casaSessionActive, isCasaDatabaseConfigured } from "@/lib/db/casa";

export const runtime = "nodejs";

export async function GET() {
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
  const loaded = await loadCasaAuthorization(session.userId, null);
  return NextResponse.json(loaded);
}
