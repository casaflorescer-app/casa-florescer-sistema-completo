/** Persistência e RPC do MVP C1 — Agenda, Encounter e Clinical Notes. */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AppointmentKind,
  AppointmentStatus,
  EncounterStatus,
} from "@/lib/types/database";
import {
  DEFAULT_NOTE_TEMPLATE,
  isOperationalAppointmentStatus,
  type AppointmentListFilter,
  type AppointmentRow,
  type ClinicalNoteRow,
  type CreateAppointmentInput,
  type EncounterRow,
} from "@/lib/attendance/types";

export {
  APPOINTMENT_STATUSES,
  APPOINTMENT_STATUS_LABEL,
  CLINICAL_APPOINTMENT_STATUSES,
  DEFAULT_NOTE_TEMPLATE,
  ENCOUNTER_STATUSES,
  ENCOUNTER_STATUS_LABEL,
  isOperationalAppointmentStatus,
  OPERATIONAL_APPOINTMENT_STATUSES,
} from "@/lib/attendance/types";
export type {
  AppointmentListFilter,
  AppointmentRow,
  ClinicalNoteRow,
  CreateAppointmentInput,
  EncounterRow,
  OperationalAppointmentStatus,
} from "@/lib/attendance/types";

export const APPOINTMENT_COLUMNS =
  "id, organization_id, practice_id, room_id, patient_id, professional_id, procedure_id, kind, starts_at, ends_at, status, urgency_note, source, checkin_at, checked_in_by, created_by" as const;

export const ENCOUNTER_COLUMNS =
  "id, organization_id, practice_id, appointment_id, patient_id, professional_id, procedure_id, status, signed_at, signed_by, created_at" as const;

export const CLINICAL_NOTE_COLUMNS =
  "id, encounter_id, organization_id, practice_id, body_ciphertext, template_code, version, created_by, created_at" as const;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const APPOINTMENT_STATUS_SET = new Set<string>([
  "scheduled",
  "confirmed",
  "checked_in",
  "in_progress",
  "completed",
  "no_show",
  "cancelled",
]);

const ENCOUNTER_STATUS_SET = new Set<string>([
  "open",
  "signed",
  "amended",
  "cancelled",
]);

const APPOINTMENT_KIND_SET = new Set<string>(["consultation", "procedure"]);

function asAppointmentStatus(value: unknown): AppointmentStatus | null {
  return typeof value === "string" && APPOINTMENT_STATUS_SET.has(value)
    ? (value as AppointmentStatus)
    : null;
}

function asEncounterStatus(value: unknown): EncounterStatus | null {
  return typeof value === "string" && ENCOUNTER_STATUS_SET.has(value)
    ? (value as EncounterStatus)
    : null;
}

function asAppointmentKind(value: unknown): AppointmentKind | null {
  return typeof value === "string" && APPOINTMENT_KIND_SET.has(value)
    ? (value as AppointmentKind)
    : null;
}

export function mapAttendanceRpcError(error: { message?: string } | null): string {
  const message = error?.message ?? "";
  if (message.includes("NOT_AUTHENTICATED")) return "Sessão expirada. Entre novamente.";
  if (message.includes("PROFILE_INACTIVE")) return "Perfil inativo.";
  if (message.includes("FORBIDDEN") || message.includes("NOT_AUTHORIZED")) {
    return "Usuário sem permissão para esta operação.";
  }
  if (message.includes("APPOINTMENT_NOT_FOUND")) return "Agendamento não encontrado.";
  if (message.includes("APPOINTMENT_TERMINAL")) {
    return "Agendamento já encerrado; não é possível alterar o status.";
  }
  if (message.includes("STATUS_VIA_ENCOUNTER_RPC")) {
    return "Status clínico da agenda só pode ser alterado pelo atendimento.";
  }
  if (message.includes("APPOINTMENT_STATUS_VIA_ENCOUNTER_RPC")) {
    return "Status clínico da agenda só pode ser alterado pelo atendimento.";
  }
  if (message.includes("INVALID_STATUS_TRANSITION")) {
    return "Transição de status não permitida.";
  }
  if (message.includes("INVALID_STATUS")) return "Status inválido.";
  if (message.includes("PROFESSIONAL_REQUIRED")) {
    return "É necessário vínculo de profissional na prática.";
  }
  if (message.includes("APPOINTMENT_PROFESSIONAL_MISMATCH")) {
    return "Somente a médica do agendamento pode abrir o atendimento.";
  }
  if (message.includes("APPOINTMENT_NOT_ATTENDABLE")) {
    return "Este agendamento não pode ser atendido.";
  }
  if (message.includes("ENCOUNTER_NOT_FOUND")) return "Atendimento não encontrado.";
  if (message.includes("ENCOUNTER_NOT_OPEN")) {
    return "O atendimento não está aberto para edição.";
  }
  if (message.includes("ENCOUNTER_OWNER_REQUIRED")) {
    return "Somente a médica responsável pelo atendimento pode continuar.";
  }
  if (message.includes("ENCOUNTER_SIGNED_LOCKED")) {
    return "Atendimento assinado não pode ser reaberto.";
  }
  if (message.includes("ENCOUNTER_SIGNED_IDENTITY_LOCKED")) {
    return "Dados de identidade do atendimento assinado não podem ser alterados.";
  }
  if (message.includes("NOTE_BODY_REQUIRED")) return "Informe o conteúdo da nota clínica.";
  if (message.includes("NOTE_REQUIRED_BEFORE_SIGN")) {
    return "Registre ao menos uma nota clínica antes de assinar.";
  }
  if (message.includes("Nota clinica bloqueada")) {
    return "Nota clínica bloqueada: o atendimento não está aberto.";
  }
  return message || "Não foi possível concluir a operação.";
}

export function toAppointmentRow(
  value: Record<string, unknown>,
  extras?: {
    patientName?: string | null;
    professionalName?: string | null;
    roomName?: string | null;
  },
): AppointmentRow | null {
  const id = asString(value.id);
  const organizationId = asString(value.organization_id);
  const practiceId = asString(value.practice_id);
  const roomId = asString(value.room_id);
  const patientId = asString(value.patient_id);
  const professionalId = asString(value.professional_id);
  const startsAt = asString(value.starts_at);
  const endsAt = asString(value.ends_at);
  const status = asAppointmentStatus(value.status);
  const kind = asAppointmentKind(value.kind) ?? "consultation";
  const createdBy = asString(value.created_by);
  if (
    !id ||
    !organizationId ||
    !practiceId ||
    !roomId ||
    !patientId ||
    !professionalId ||
    !startsAt ||
    !endsAt ||
    !status ||
    !createdBy
  ) {
    return null;
  }
  return {
    id,
    organizationId,
    practiceId,
    roomId,
    patientId,
    professionalId,
    procedureId: asString(value.procedure_id),
    kind,
    startsAt,
    endsAt,
    status,
    urgencyNote: asString(value.urgency_note),
    source: asString(value.source) ?? "reception",
    checkinAt: asString(value.checkin_at),
    checkedInBy: asString(value.checked_in_by),
    createdBy,
    patientName: extras?.patientName ?? null,
    professionalName: extras?.professionalName ?? null,
    roomName: extras?.roomName ?? null,
  };
}

export function toEncounterRow(
  value: Record<string, unknown>,
  extras?: { patientName?: string | null; professionalName?: string | null },
): EncounterRow | null {
  const id = asString(value.id);
  const organizationId = asString(value.organization_id);
  const practiceId = asString(value.practice_id);
  const patientId = asString(value.patient_id);
  const professionalId = asString(value.professional_id);
  const status = asEncounterStatus(value.status);
  const createdAt = asString(value.created_at);
  if (
    !id ||
    !organizationId ||
    !practiceId ||
    !patientId ||
    !professionalId ||
    !status ||
    !createdAt
  ) {
    return null;
  }
  return {
    id,
    organizationId,
    practiceId,
    appointmentId: asString(value.appointment_id),
    patientId,
    professionalId,
    procedureId: asString(value.procedure_id),
    status,
    signedAt: asString(value.signed_at),
    signedBy: asString(value.signed_by),
    createdAt,
    patientName: extras?.patientName ?? null,
    professionalName: extras?.professionalName ?? null,
  };
}

export function toClinicalNoteRow(value: Record<string, unknown>): ClinicalNoteRow | null {
  const id = asString(value.id);
  const encounterId = asString(value.encounter_id);
  const organizationId = asString(value.organization_id);
  const practiceId = asString(value.practice_id);
  const body = typeof value.body_ciphertext === "string" ? value.body_ciphertext : null;
  const version = asNumber(value.version);
  const createdBy = asString(value.created_by);
  const createdAt = asString(value.created_at);
  if (
    !id ||
    !encounterId ||
    !organizationId ||
    !practiceId ||
    body == null ||
    version == null ||
    !createdBy ||
    !createdAt
  ) {
    return null;
  }
  return {
    id,
    encounterId,
    organizationId,
    practiceId,
    body,
    templateCode: asString(value.template_code),
    version,
    createdBy,
    createdAt,
  };
}

// ---------------------------------------------------------------------------
// Agenda — select / insert (RLS) + RPC status
// ---------------------------------------------------------------------------

export async function listAppointments(
  supabase: SupabaseClient,
  filter: AppointmentListFilter,
): Promise<AppointmentRow[]> {
  let query = supabase
    .from("appointments")
    .select(APPOINTMENT_COLUMNS)
    .eq("practice_id", filter.practiceId)
    .gte("starts_at", filter.from)
    .lt("starts_at", filter.to)
    .order("starts_at", { ascending: true });

  if (filter.professionalId) {
    query = query.eq("professional_id", filter.professionalId);
  }
  if (filter.status) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    query = query.in("status", statuses);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return data
    .map((raw) => toAppointmentRow(raw as Record<string, unknown>))
    .filter((item): item is AppointmentRow => Boolean(item));
}

export async function getAppointment(
  supabase: SupabaseClient,
  appointmentId: string,
): Promise<AppointmentRow | null> {
  const { data, error } = await supabase
    .from("appointments")
    .select(APPOINTMENT_COLUMNS)
    .eq("id", appointmentId)
    .maybeSingle();
  if (error || !data) return null;
  return toAppointmentRow(data as Record<string, unknown>);
}

export async function createAppointment(
  supabase: SupabaseClient,
  input: CreateAppointmentInput,
): Promise<{ row: AppointmentRow | null; error: string | null }> {
  if (input.endsAt <= input.startsAt) {
    return { row: null, error: "O horário de término deve ser após o início." };
  }
  const { data, error } = await supabase
    .from("appointments")
    .insert({
      organization_id: input.organizationId,
      practice_id: input.practiceId,
      room_id: input.roomId,
      patient_id: input.patientId,
      professional_id: input.professionalId,
      procedure_id: input.procedureId ?? null,
      kind: input.kind ?? "consultation",
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      urgency_note: input.urgencyNote ?? null,
      source: input.source ?? "reception",
      created_by: input.createdBy,
      status: "scheduled",
    })
    .select(APPOINTMENT_COLUMNS)
    .single();
  if (error) {
    return {
      row: null,
      error: error.message.includes("appointments_room_no_overlap")
        ? "Já existe agendamento nesta sala no mesmo horário."
        : error.message || "Não foi possível criar o agendamento.",
    };
  }
  return { row: toAppointmentRow(data as Record<string, unknown>), error: null };
}

export async function appointmentSetStatus(
  supabase: SupabaseClient,
  appointmentId: string,
  status: AppointmentStatus,
): Promise<{ row: AppointmentRow | null; error: string | null }> {
  // Ações administrativas: não enviar in_progress/completed (somente RPCs de encounter).
  if (!isOperationalAppointmentStatus(status)) {
    return {
      row: null,
      error: "Status clínico da agenda só pode ser alterado pelo atendimento.",
    };
  }

  const { data, error } = await supabase.rpc("appointment_set_status", {
    p_appointment_id: appointmentId,
    p_status: status,
  });
  if (error) return { row: null, error: mapAttendanceRpcError(error) };
  if (!data || typeof data !== "object") {
    return { row: null, error: "Resposta inválida do servidor." };
  }
  return {
    row: toAppointmentRow(data as Record<string, unknown>),
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Encounter — select + RPCs open / sign
// ---------------------------------------------------------------------------

export async function getEncounter(
  supabase: SupabaseClient,
  encounterId: string,
): Promise<EncounterRow | null> {
  const { data, error } = await supabase
    .from("encounters")
    .select(ENCOUNTER_COLUMNS)
    .eq("id", encounterId)
    .maybeSingle();
  if (error || !data) return null;
  return toEncounterRow(data as Record<string, unknown>);
}

export async function getEncounterByAppointment(
  supabase: SupabaseClient,
  appointmentId: string,
): Promise<EncounterRow | null> {
  const { data, error } = await supabase
    .from("encounters")
    .select(ENCOUNTER_COLUMNS)
    .eq("appointment_id", appointmentId)
    .maybeSingle();
  if (error || !data) return null;
  return toEncounterRow(data as Record<string, unknown>);
}

export async function listEncountersForPatient(
  supabase: SupabaseClient,
  practiceId: string,
  patientId: string,
): Promise<EncounterRow[]> {
  const { data, error } = await supabase
    .from("encounters")
    .select(ENCOUNTER_COLUMNS)
    .eq("practice_id", practiceId)
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data
    .map((raw) => toEncounterRow(raw as Record<string, unknown>))
    .filter((item): item is EncounterRow => Boolean(item));
}

export async function encounterOpenFromAppointment(
  supabase: SupabaseClient,
  appointmentId: string,
): Promise<{ encounterId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("encounter_open_from_appointment", {
    p_appointment_id: appointmentId,
  });
  if (error) return { encounterId: null, error: mapAttendanceRpcError(error) };
  return {
    encounterId: typeof data === "string" ? data : null,
    error: null,
  };
}

export async function encounterSign(
  supabase: SupabaseClient,
  encounterId: string,
): Promise<{ encounterId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("encounter_sign", {
    p_encounter_id: encounterId,
  });
  if (error) return { encounterId: null, error: mapAttendanceRpcError(error) };
  return {
    encounterId: typeof data === "string" ? data : null,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Clinical notes — select + RPC upsert
// ---------------------------------------------------------------------------

export async function listClinicalNotes(
  supabase: SupabaseClient,
  encounterId: string,
): Promise<ClinicalNoteRow[]> {
  const { data, error } = await supabase
    .from("clinical_notes")
    .select(CLINICAL_NOTE_COLUMNS)
    .eq("encounter_id", encounterId)
    .order("version", { ascending: false })
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data
    .map((raw) => toClinicalNoteRow(raw as Record<string, unknown>))
    .filter((item): item is ClinicalNoteRow => Boolean(item));
}

export async function getLatestClinicalNote(
  supabase: SupabaseClient,
  encounterId: string,
  templateCode: string = DEFAULT_NOTE_TEMPLATE,
): Promise<ClinicalNoteRow | null> {
  const { data, error } = await supabase
    .from("clinical_notes")
    .select(CLINICAL_NOTE_COLUMNS)
    .eq("encounter_id", encounterId)
    .eq("template_code", templateCode)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return toClinicalNoteRow(data as Record<string, unknown>);
}

export async function clinicalNoteUpsert(
  supabase: SupabaseClient,
  input: {
    encounterId: string;
    body: string;
    templateCode?: string;
  },
): Promise<{ noteId: string | null; error: string | null }> {
  const body = input.body.trim();
  if (!body) return { noteId: null, error: "Informe o conteúdo da nota clínica." };

  const { data, error } = await supabase.rpc("clinical_note_upsert", {
    p_encounter_id: input.encounterId,
    p_body: body,
    p_template_code: input.templateCode?.trim() || DEFAULT_NOTE_TEMPLATE,
  });
  if (error) return { noteId: null, error: mapAttendanceRpcError(error) };
  return {
    noteId: typeof data === "string" ? data : null,
    error: null,
  };
}
