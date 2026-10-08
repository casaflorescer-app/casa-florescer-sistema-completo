import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppointmentStatus } from "@/lib/types/database";
import type {
  PatientJourneyStatus,
  PatientNotificationCategory,
  PatientPortalAppointment,
  PatientPortalPayload,
} from "@/lib/portal/types";

/** Limiar padrão (espelha patient_schedule_notify_threshold_min no banco). */
export const DEFAULT_NOTIFY_THRESHOLD_MIN = 5;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBool(value: unknown): boolean {
  return value === true;
}

function asJourneyStatus(value: unknown): PatientJourneyStatus {
  const raw = asString(value);
  switch (raw) {
    case "waiting":
    case "delayed":
    case "in_progress":
    case "completed":
    case "cancelled":
    case "no_show":
    case "scheduled":
      return raw;
    default:
      return "scheduled";
  }
}

export const JOURNEY_STATUS_LABEL: Record<PatientJourneyStatus, string> = {
  scheduled: "Agendado",
  waiting: "Aguardando atendimento",
  delayed: "Previsão atualizada",
  in_progress: "Atendimento em andamento",
  completed: "Atendimento concluído",
  cancelled: "Atendimento cancelado pela clínica",
  no_show: "Não comparecimento",
};

function deriveJourneyStatus(input: {
  status: AppointmentStatus;
  delayMinutes: number | null;
  isEarlier: boolean;
  hasArrived: boolean;
  actualStartAt: string | null;
  actualEndAt: string | null;
  fromRpc: unknown;
}): PatientJourneyStatus {
  if (input.fromRpc) return asJourneyStatus(input.fromRpc);
  if (input.status === "cancelled") return "cancelled";
  if (input.status === "no_show") return "no_show";
  if (input.actualEndAt || input.status === "completed") return "completed";
  if (input.actualStartAt || input.status === "in_progress") return "in_progress";
  if (input.hasArrived || input.status === "checked_in") return "waiting";
  if (
    !input.isEarlier &&
    (input.delayMinutes ?? 0) >= DEFAULT_NOTIFY_THRESHOLD_MIN
  ) {
    return "delayed";
  }
  return "scheduled";
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
  const delayMinutes = asNumber(raw.delay_minutes);
  const isEarlier = asBool(raw.is_earlier);
  const hasArrived = asBool(raw.has_arrived);
  const actualStartAt = asString(raw.actual_start_at);
  const actualEndAt = asString(raw.actual_end_at);
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
    predictionUpdatedAt: asString(raw.prediction_updated_at),
    delayMinutes,
    isEarlier,
    hasPrediction: asBool(raw.has_prediction),
    hasArrived,
    actualStartAt,
    actualEndAt,
    journeyStatus: deriveJourneyStatus({
      status,
      delayMinutes,
      isEarlier,
      hasArrived,
      actualStartAt,
      actualEndAt,
      fromRpc: raw.journey_status,
    }),
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
    return {
      data: { patientId: "", appointments: [], notifyThresholdMin: DEFAULT_NOTIFY_THRESHOLD_MIN },
      error: null,
    };
  }
  const patientId = asString(payload.patient_id) ?? "";
  const rows = Array.isArray(payload.appointments) ? payload.appointments : [];
  const appointments = rows
    .map((row) => mapAppointment(row as Record<string, unknown>))
    .filter((item): item is PatientPortalAppointment => Boolean(item));
  return {
    data: {
      patientId,
      appointments,
      notifyThresholdMin: asNumber(payload.notify_threshold_min) ?? DEFAULT_NOTIFY_THRESHOLD_MIN,
    },
    error: null,
  };
}

export async function patientPortalRecordArrival(
  supabase: SupabaseClient,
  appointmentId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("patient_portal_record_arrival", {
    p_appointment_id: appointmentId,
  });
  if (!error) return { error: null };
  const message = error.message || "";
  if (message.includes("FORBIDDEN")) {
    return { error: "Não foi possível registrar a chegada para este atendimento." };
  }
  if (message.includes("APPOINTMENT_NOT_ATTENDABLE")) {
    return { error: "Este atendimento não está disponível para registro de chegada." };
  }
  return { error: message || "Não foi possível registrar sua chegada." };
}

export function pickNextAppointment(
  appointments: PatientPortalAppointment[],
  now = new Date(),
): PatientPortalAppointment | null {
  const upcoming = appointments
    .filter((row) => !["cancelled", "no_show", "completed"].includes(row.status))
    .filter((row) => !row.actualEndAt)
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
  reassurance: string | null;
} {
  const scheduled = row.scheduledStartsAt;
  if (row.journeyStatus === "in_progress") {
    return {
      headline: "Seu atendimento está em andamento",
      detail: row.actualStartAt
        ? `Início registrado às ${formatClock(row.actualStartAt)}.`
        : "A médica já iniciou o atendimento.",
      reassurance: "Você não precisa ligar para acompanhar: as atualizações aparecem aqui.",
    };
  }
  if (row.journeyStatus === "completed") {
    return {
      headline: "Atendimento concluído",
      detail: row.actualEndAt
        ? `Término registrado às ${formatClock(row.actualEndAt)}.`
        : "Seu atendimento foi concluído.",
      reassurance: "Orientações e documentos publicados ficarão disponíveis neste aplicativo.",
    };
  }
  if (!row.hasPrediction || !row.predictedStartsAt) {
    return {
      headline: "Horário previsto conforme agendamento",
      detail: `Atendimento previsto para ${formatClock(scheduled)}.`,
      reassurance: "Você não precisa ligar: se houver alteração, a previsão será atualizada aqui.",
    };
  }
  const delay = row.delayMinutes ?? 0;
  if (row.isEarlier) {
    return {
      headline: `Previsão atual: ${formatClock(row.predictedStartsAt)}`,
      detail: "Sua consulta pode começar um pouco antes do horário agendado.",
      reassurance: "Acompanhe novas atualizações por este aplicativo.",
    };
  }
  if (delay >= 60) {
    return {
      headline: `Previsão atual: ${formatClock(row.predictedStartsAt)}`,
      detail: `Identificamos uma alteração excepcional na agenda. Seu horário previsto foi atualizado para aproximadamente ${formatClock(row.predictedStartsAt)}.`,
      reassurance: "Você não precisa ligar para acompanhar esta atualização. O horário será atualizado aqui.",
    };
  }
  if (delay >= DEFAULT_NOTIFY_THRESHOLD_MIN) {
    return {
      headline: `Previsão atual: ${formatClock(row.predictedStartsAt)}`,
      detail: `Possível atraso de aproximadamente ${delay} minutos em relação às ${formatClock(scheduled)}.`,
      reassurance: "Você não precisa ligar para acompanhar esta atualização. O horário será atualizado aqui.",
    };
  }
  if (delay > 0) {
    return {
      headline: `Previsão atual: ${formatClock(row.predictedStartsAt)}`,
      detail: `Atendimento previsto próximo de ${formatClock(row.predictedStartsAt)}.`,
      reassurance: null,
    };
  }
  return {
    headline: `Atendimento previsto para ${formatClock(row.predictedStartsAt)}`,
    detail: "Sem atraso estimado no momento.",
    reassurance: "Se houver alteração, a previsão será atualizada neste aplicativo.",
  };
}

export function classifyNotificationEvent(eventType: string): PatientNotificationCategory {
  if (
    [
      "appointment_schedule_updated",
      "appointment_attendance_started",
      "appointment_attendance_ended",
    ].includes(eventType)
  ) {
    return "operational";
  }
  if (
    [
      "clinical_orientation_published",
      "prescription_published",
      "exam_analyzed",
      "orientation_feedback_reply",
    ].includes(eventType)
  ) {
    return "clinical";
  }
  return "relationship";
}

export const NOTIFICATION_CATEGORY_LABEL: Record<PatientNotificationCategory, string> = {
  operational: "Operacional",
  clinical: "Clínico",
  relationship: "Relacionamento",
};

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

export function formatDateTimeShort(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}
