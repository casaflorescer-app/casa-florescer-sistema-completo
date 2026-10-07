import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppointmentStatus } from "@/lib/types/database";
import type { PatientPortalAppointment, PatientPortalPayload } from "@/lib/portal/types";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBool(value: unknown): boolean {
  return value === true;
}

function mapAppointment(raw: Record<string, unknown>): PatientPortalAppointment | null {
  const appointmentId = asString(raw.appointment_id);
  const organizationId = asString(raw.organization_id);
  const practiceId = asString(raw.practice_id);
  const scheduledStartsAt = asString(raw.scheduled_starts_at);
  const scheduledEndsAt = asString(raw.scheduled_ends_at);
  const status = asString(raw.status) as AppointmentStatus | null;
  if (!appointmentId || !organizationId || !practiceId || !scheduledStartsAt || !scheduledEndsAt || !status) {
    return null;
  }
  return {
    appointmentId,
    organizationId,
    practiceId,
    scheduledStartsAt,
    scheduledEndsAt,
    status,
    professionalName: asString(raw.professional_name) ?? "Profissional",
    procedureLabel: asString(raw.procedure_label) ?? "Consulta",
    roomName: asString(raw.room_name),
    predictedStartsAt: asString(raw.predicted_starts_at),
    predictedEndsAt: asString(raw.predicted_ends_at),
    delayMinutes: asNumber(raw.delay_minutes),
    isEarlier: asBool(raw.is_earlier),
    hasPrediction: asBool(raw.has_prediction),
  };
}

export async function listPatientPortalAppointments(
  supabase: SupabaseClient,
  limit = 40,
): Promise<{ data: PatientPortalPayload | null; error: string | null }> {
  const { data, error } = await supabase.rpc("patient_portal_my_appointments", {
    p_limit: limit,
  });
  if (error) {
    return { data: null, error: error.message || "Não foi possível carregar suas consultas." };
  }
  const payload = data as Record<string, unknown> | null;
  if (!payload || typeof payload !== "object") {
    return { data: { patientId: "", appointments: [] }, error: null };
  }
  const patientId = asString(payload.patient_id) ?? "";
  const rows = Array.isArray(payload.appointments) ? payload.appointments : [];
  const appointments = rows
    .map((row) => mapAppointment(row as Record<string, unknown>))
    .filter((item): item is PatientPortalAppointment => Boolean(item));
  return { data: { patientId, appointments }, error: null };
}

export function pickNextAppointment(
  appointments: PatientPortalAppointment[],
  now = new Date(),
): PatientPortalAppointment | null {
  const upcoming = appointments
    .filter((row) => !["cancelled", "no_show", "completed"].includes(row.status))
    .filter((row) => new Date(row.scheduledEndsAt).getTime() >= now.getTime() - 2 * 60 * 60 * 1000)
    .sort(
      (a, b) =>
        new Date(a.scheduledStartsAt).getTime() - new Date(b.scheduledStartsAt).getTime(),
    );
  return upcoming[0] ?? null;
}

export function predictionCopy(row: PatientPortalAppointment): {
  headline: string;
  detail: string;
} {
  const scheduled = row.scheduledStartsAt;
  if (!row.hasPrediction || !row.predictedStartsAt) {
    return {
      headline: "Horário previsto conforme agendamento",
      detail: "Ainda não há uma previsão atualizada para este horário.",
    };
  }
  const delay = row.delayMinutes ?? 0;
  if (row.isEarlier) {
    return {
      headline: `Previsão atual: ${formatClock(row.predictedStartsAt)}`,
      detail: "Sua consulta pode começar um pouco antes do horário agendado.",
    };
  }
  if (delay >= 5) {
    return {
      headline: `Previsão atual: ${formatClock(row.predictedStartsAt)}`,
      detail: `Possível atraso de aproximadamente ${delay} minutos em relação às ${formatClock(scheduled)}.`,
    };
  }
  if (delay > 0) {
    return {
      headline: `Previsão atual: ${formatClock(row.predictedStartsAt)}`,
      detail: `Atendimento previsto próximo de ${formatClock(row.predictedStartsAt)}.`,
    };
  }
  return {
    headline: `Atendimento previsto para ${formatClock(row.predictedStartsAt)}`,
    detail: "Sem atraso estimado no momento.",
  };
}

export function formatClock(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

export function formatDay(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}
