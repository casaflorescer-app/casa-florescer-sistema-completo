import { NextResponse } from "next/server";
import { z } from "zod";
import { loadCasaAuthorization } from "@/lib/auth/casa-authorization";
import { getAuthUser } from "@/lib/auth/session";
import { loadPatientChartCasa } from "@/lib/casa/actions";
import { upsertPatientClinicalCasa } from "@/lib/casa/writes";
import { isCasaDatabaseConfigured } from "@/lib/db/casa";

export const runtime = "nodejs";

const uuid = z.string().uuid();

const readSchema = z.object({
  patientId: uuid,
  practiceId: uuid,
});

const writeSchema = z.object({
  patientId: uuid,
  organizationId: uuid,
  practiceId: uuid,
  allergies: z.string().max(4000).nullable().optional(),
  continuousMedications: z.string().max(4000).nullable().optional(),
  comorbidities: z.string().max(4000).nullable().optional(),
});

function unavailable() {
  return NextResponse.json(
    { error: "A sessão da casa ainda não está ligada neste processo." },
    { status: 503 },
  );
}

function anonymous() {
  return NextResponse.json({ error: "Sem sessão." }, { status: 401 });
}

function hidden() {
  return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
}

function denied() {
  return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
}

function invalid() {
  return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
}

function unexpected() {
  console.error("casa clinical: falha interna");
  return NextResponse.json({ error: "Não foi possível concluir a operação." }, { status: 500 });
}

function fromError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "Sem sessão.") return anonymous();
  if (message.includes("ainda não está ligada")) return unavailable();
  if (message.includes("recusou esta operação") || message.includes("row-level security")) {
    return hidden();
  }
  return unexpected();
}

type Gate = "allow" | "secretary" | "hidden" | "down" | "anon";

async function gate(practiceId: string): Promise<Gate> {
  const user = await getAuthUser();
  if (!user) return "anon";
  const loaded = await loadCasaAuthorization(user.userId, user.email || null);
  if (loaded.error) return "down";
  const onPractice = loaded.context.memberships.some(
    (item) => item.practiceId === practiceId && item.role === "physician",
  );
  if (onPractice) return "allow";
  if (loaded.context.memberships.some((item) => item.role === "secretary")) return "secretary";
  return "hidden";
}

function gated(result: Gate) {
  if (result === "anon") return anonymous();
  if (result === "secretary") return denied();
  if (result === "down") return unexpected();
  return hidden();
}

export async function GET(request: Request) {
  if (!isCasaDatabaseConfigured()) return unavailable();
  const url = new URL(request.url);
  const parsed = readSchema.safeParse({
    patientId: url.searchParams.get("patientId"),
    practiceId: url.searchParams.get("practiceId"),
  });
  if (!parsed.success) return invalid();
  try {
    const access = await gate(parsed.data.practiceId);
    if (access !== "allow") return gated(access);
    const chart = await loadPatientChartCasa(parsed.data);
    if (!chart.patient) return hidden();
    return NextResponse.json(chart);
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: Request) {
  if (!isCasaDatabaseConfigured()) return unavailable();
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return invalid();
  }
  const parsed = writeSchema.safeParse(json);
  if (!parsed.success) return invalid();
  try {
    const access = await gate(parsed.data.practiceId);
    if (access !== "allow") return gated(access);
    const user = await getAuthUser();
    if (!user) return anonymous();
    await upsertPatientClinicalCasa({
      patientId: parsed.data.patientId,
      organizationId: parsed.data.organizationId,
      practiceId: parsed.data.practiceId,
      allergies: parsed.data.allergies ?? null,
      continuousMedications: parsed.data.continuousMedications ?? null,
      comorbidities: parsed.data.comorbidities ?? null,
      updatedBy: user.userId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
