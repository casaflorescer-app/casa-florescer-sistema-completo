import { NextResponse } from "next/server";
import { z } from "zod";
import { callCasaRpc } from "@/lib/casa/rpc";
import { readAppointmentCasa } from "@/lib/casa/reads";
import { createAppointmentCasa, updateAppointmentOpenCasa } from "@/lib/casa/writes";
import { isCasaDatabaseConfigured } from "@/lib/db/casa";

export const runtime = "nodejs";

const uuid = z.string().uuid();

const createSchema = z.object({
  organizationId: uuid,
  practiceId: uuid,
  roomId: uuid,
  patientId: uuid,
  professionalId: uuid,
  startsAt: z.string().min(10).max(40),
  endsAt: z.string().min(10).max(40),
  kind: z.enum(["consultation", "procedure"]).optional(),
  procedureId: uuid.nullable().optional(),
  urgencyNote: z.string().max(2000).nullable().optional(),
  source: z.string().max(40).nullable().optional(),
});

const updateSchema = z.object({
  appointmentId: uuid,
  patientId: uuid,
  professionalId: uuid,
  roomId: uuid.nullable(),
  kind: z.enum(["consultation", "procedure"]),
  startsAt: z.string().min(10).max(40),
  endsAt: z.string().min(10).max(40),
  urgencyNote: z.string().max(2000).nullable().optional(),
});

const idSchema = z.object({
  appointmentId: uuid,
});

function unavailable() {
  return NextResponse.json(
    { error: "A sessão da casa ainda não está ligada neste processo." },
    { status: 503 },
  );
}

function hidden() {
  return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
}

function invalid() {
  return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
}

function view(row: Record<string, unknown>) {
  return {
    id: row.id,
    practiceId: row.practice_id,
    patientId: row.patient_id,
    professionalId: row.professional_id,
    roomId: row.room_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    urgencyNote: row.urgency_note ?? null,
    createdBy: row.created_by,
  };
}

function fromError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "Sem sessão.") {
    return NextResponse.json({ error: "Sem sessão." }, { status: 401 });
  }
  if (message.includes("ainda não está ligada")) return unavailable();
  if (
    message === "O horário de término deve ser após o início." ||
    message === "Informe o procedimento para agendamentos deste tipo." ||
    message === "Tipo de agendamento inválido."
  ) {
    return NextResponse.json({ error: message }, { status: 400 });
  }
  if (message.includes("appointments_professional_no_overlap")) {
    return NextResponse.json(
      { error: "A profissional já possui agendamento neste horário." },
      { status: 409 },
    );
  }
  if (message.includes("appointments_room_no_overlap")) {
    return NextResponse.json(
      { error: "Já existe agendamento nesta sala no mesmo horário." },
      { status: 409 },
    );
  }
  return hidden();
}

export async function POST(request: Request) {
  if (!isCasaDatabaseConfigured()) return unavailable();
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return invalid();
  }
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) return invalid();
  try {
    const row = await createAppointmentCasa({
      organizationId: parsed.data.organizationId,
      practiceId: parsed.data.practiceId,
      roomId: parsed.data.roomId,
      patientId: parsed.data.patientId,
      professionalId: parsed.data.professionalId,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      kind: parsed.data.kind ?? "consultation",
      procedureId: parsed.data.procedureId ?? null,
      urgencyNote: parsed.data.urgencyNote ?? null,
      source: parsed.data.source ?? null,
    });
    if (!row) return hidden();
    return NextResponse.json(view(row));
  } catch (error) {
    return fromError(error);
  }
}

export async function GET(request: Request) {
  if (!isCasaDatabaseConfigured()) return unavailable();
  const id = new URL(request.url).searchParams.get("id");
  const parsed = uuid.safeParse(id);
  if (!parsed.success) return invalid();
  try {
    const row = await readAppointmentCasa(parsed.data);
    if (!row) return hidden();
    return NextResponse.json(view(row));
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(request: Request) {
  if (!isCasaDatabaseConfigured()) return unavailable();
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return invalid();
  }
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) return invalid();
  if (parsed.data.endsAt <= parsed.data.startsAt) {
    return NextResponse.json(
      { error: "O horário de término deve ser após o início." },
      { status: 400 },
    );
  }
  try {
    const row = await updateAppointmentOpenCasa({
      appointmentId: parsed.data.appointmentId,
      patientId: parsed.data.patientId,
      professionalId: parsed.data.professionalId,
      roomId: parsed.data.roomId,
      kind: parsed.data.kind,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      urgencyNote: parsed.data.urgencyNote ?? null,
    });
    if (!row) return hidden();
    return NextResponse.json(view(row));
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(request: Request) {
  if (!isCasaDatabaseConfigured()) return unavailable();
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return invalid();
  }
  const parsed = idSchema.safeParse(json);
  if (!parsed.success) return invalid();
  try {
    const data = await callCasaRpc("appointment_set_status", [
      parsed.data.appointmentId,
      "cancelled",
    ]);
    if (!data || typeof data !== "object") return hidden();
    return NextResponse.json(view(data as Record<string, unknown>));
  } catch (error) {
    return fromError(error);
  }
}
