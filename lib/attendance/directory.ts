/** Persistência e RPC do MVP C1 — Agenda, Encounter e Clinical Notes. */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AppointmentKind,
  AppointmentStatus,
  EncounterStatus,
  PregnancyRisk,
  PregnancyStatus,
} from "@/lib/types/database";
import {
  DEFAULT_NOTE_TEMPLATE,
  isOperationalAppointmentStatus,
  type AppointmentListFilter,
  type AppointmentPredictionRow,
  type AppointmentRow,
  type ClinicalNoteRow,
  type CreateAppointmentInput,
  type EncounterPractice,
  type EncounterRow,
  type PregnancyContext,
  type UpdateAppointmentInput,
} from "@/lib/attendance/types";
import {
  computeAgendaPredictions,
  type AppointmentPredictionView,
  type HistoricalDurationSample,
  type PredictionAppointment,
} from "@/lib/attendance/appointment-prediction";

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
  AppointmentPredictionRow,
  AppointmentRow,
  ClinicalNoteRow,
  CreateAppointmentInput,
  EncounterPractice,
  EncounterRow,
  OperationalAppointmentStatus,
  PregnancyContext,
  UpdateAppointmentInput,
} from "@/lib/attendance/types";
export type { AppointmentPredictionView } from "@/lib/attendance/appointment-prediction";

export const APPOINTMENT_COLUMNS =
  "id, organization_id, practice_id, room_id, patient_id, professional_id, procedure_id, kind, starts_at, ends_at, scheduled_starts_at, scheduled_ends_at, status, urgency_note, source, checkin_at, checked_in_by, arrival_at, arrival_recorded_by, actual_start_at, actual_start_recorded_by, actual_end_at, actual_end_recorded_by, created_by" as const;

export const ENCOUNTER_COLUMNS =
  "id, organization_id, practice_id, appointment_id, patient_id, professional_id, procedure_id, status, signed_at, signed_by, created_at" as const;

export const CLINICAL_NOTE_COLUMNS =
  "id, encounter_id, organization_id, practice_id, body_ciphertext, template_code, version, created_by, created_at" as const;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toEncounterPractice(value: unknown, practiceId: string): EncounterPractice | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = asString(row.id);
  const name = asString(row.name);
  const code = asString(row.code);
  if (!id || !name || !code || id !== practiceId) return null;
  return { id, name, code };
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

const PREGNANCY_STATUS_SET = new Set<string>(["in_care", "closed", "transferred", "cancelled"]);

const PREGNANCY_RISK_SET = new Set<string>(["habitual", "high"]);

const PREGNANCY_CONTEXT_COLUMNS =
  "id, status, lmp_date, calculated_edd, clinical_edd, risk, primary_professional_id, backup_professional_id" as const;

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

function asPregnancyStatus(value: unknown): PregnancyStatus | null {
  return typeof value === "string" && PREGNANCY_STATUS_SET.has(value)
    ? (value as PregnancyStatus)
    : null;
}

function asPregnancyRisk(value: unknown): PregnancyRisk | null {
  return typeof value === "string" && PREGNANCY_RISK_SET.has(value)
    ? (value as PregnancyRisk)
    : null;
}

function toPregnancyContext(value: Record<string, unknown>): PregnancyContext | null {
  const id = asString(value.id);
  const status = asPregnancyStatus(value.status);
  const primaryProfessionalId = asString(value.primary_professional_id);
  if (!id || !status || !primaryProfessionalId) return null;
  return {
    id,
    status,
    lmpDate: asString(value.lmp_date),
    estimatedDueDate: asString(value.calculated_edd),
    clinicalDueDate: asString(value.clinical_edd),
    risk: asPregnancyRisk(value.risk),
    primaryProfessionalId,
    backupProfessionalId: asString(value.backup_professional_id),
  };
}

export function mapAttendanceRpcError(error: { message?: string } | null): string {
  const message = error?.message ?? "";
  if (message.includes("NOT_AUTHENTICATED")) return "Sessão expirada. Entre novamente.";
  if (message.includes("PROFILE_INACTIVE")) return "Perfil inativo.";
  if (message.includes("PREGNANCY_LINK_FORBIDDEN")) {
    return "Você não possui autorização para vincular esta gestação ao atendimento.";
  }
  if (message.includes("PREGNANCY_LINK_ABSENT")) {
    return "Este atendimento não possui gestação vinculada.";
  }
  if (message.includes("FORBIDDEN") || message.includes("NOT_AUTHORIZED")) {
    return "Você não possui permissão para realizar esta operação.";
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
  if (message.includes("APPOINTMENT_NOT_EDITABLE")) {
    return "Este agendamento não pode mais ser editado.";
  }
  if (message.includes("APPOINTMENT_HAS_ENCOUNTER")) {
    return "Este agendamento já possui atendimento clínico e não pode ser editado.";
  }
  if (message.includes("APPOINTMENT_PROFESSIONAL_OVERLAP")) {
    return "A profissional já possui agendamento neste horário.";
  }
  if (message.includes("APPOINTMENT_ROOM_OVERLAP")) {
    return "Já existe agendamento nesta sala no mesmo horário.";
  }
  if (message.includes("APPOINTMENT_UPDATE_INVALID_RANGE")) {
    return "O horário de término deve ser após o início.";
  }
  if (message.includes("APPOINTMENT_UPDATE_INVALID")) {
    return "Informe paciente, profissional, procedimento, sala e horários válidos.";
  }
  if (message.includes("APPOINTMENT_UPDATE_STATUS_LOCKED")) {
    return "A edição não altera o status do agendamento.";
  }
  if (message.includes("APPOINTMENT_UPDATE_SCOPE_LOCKED")) {
    return "Não é permitido alterar o escopo deste agendamento.";
  }
  if (message.includes("APPOINTMENT_SCHEDULED_SNAPSHOT_LOCKED")) {
    return "O horário originalmente agendado não pode ser alterado.";
  }
  if (message.includes("APPOINTMENT_ARRIVAL_LOCKED")) {
    return "A chegada já foi registrada e não pode ser alterada.";
  }
  if (message.includes("APPOINTMENT_ACTUAL_START_LOCKED")) {
    return "O início clínico já foi registrado e não pode ser alterado.";
  }
  if (message.includes("APPOINTMENT_ACTUAL_END_LOCKED")) {
    return "O término clínico já foi registrado e não pode ser alterado.";
  }
  if (message.includes("ENCOUNTER_NOT_FOUND")) return "Atendimento não encontrado.";
  if (message.includes("ENCOUNTER_NOT_OPEN")) {
    return "O atendimento precisa estar aberto.";
  }
  if (message.includes("ENCOUNTER_OWNER_REQUIRED")) {
    return "Somente a médica responsável pelo atendimento pode continuar.";
  }
  if (message.includes("PREGNANCY_LINK_ONLY_RPC")) {
    return "Vínculo obstétrico deve ser realizado pela operação autorizada.";
  }
  if (message.includes("PREGNANCY_NOT_IN_CARE")) {
    return "A gestação selecionada não está em acompanhamento.";
  }
  if (message.includes("ENCOUNTER_SIGNED_PREGNANCY_LOCKED")) {
    return "Não é possível alterar o vínculo de um atendimento já assinado.";
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
    scheduledStartsAt: asString(value.scheduled_starts_at) ?? startsAt,
    scheduledEndsAt: asString(value.scheduled_ends_at) ?? endsAt,
    status,
    urgencyNote: asString(value.urgency_note),
    source: asString(value.source) ?? "reception",
    checkinAt: asString(value.checkin_at),
    checkedInBy: asString(value.checked_in_by),
    arrivalAt: asString(value.arrival_at),
    arrivalRecordedBy: asString(value.arrival_recorded_by),
    actualStartAt: asString(value.actual_start_at),
    actualStartRecordedBy: asString(value.actual_start_recorded_by),
    actualEndAt: asString(value.actual_end_at),
    actualEndRecordedBy: asString(value.actual_end_recorded_by),
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
    practice: toEncounterPractice(value.practice_units, practiceId),
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
      scheduled_starts_at: input.startsAt,
      scheduled_ends_at: input.endsAt,
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
      error: error.message.includes("appointments_professional_no_overlap")
        ? "A profissional já possui agendamento neste horário."
        : error.message.includes("appointments_room_no_overlap")
          ? "Já existe agendamento nesta sala no mesmo horário."
          : error.message || "Não foi possível criar o agendamento.",
    };
  }
  return { row: toAppointmentRow(data as Record<string, unknown>), error: null };
}

export async function updateAppointment(
  supabase: SupabaseClient,
  input: UpdateAppointmentInput,
): Promise<{ row: AppointmentRow | null; error: string | null }> {
  if (input.endsAt <= input.startsAt) {
    return { row: null, error: "O horário de término deve ser após o início." };
  }
  const { data, error } = await supabase.rpc("appointment_update", {
    p_appointment_id: input.appointmentId,
    p_patient_id: input.patientId,
    p_professional_id: input.professionalId,
    p_room_id: input.roomId,
    p_procedure_id: input.procedureId,
    p_kind: input.kind,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_urgency_note: input.urgencyNote ?? null,
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
    .select(`${ENCOUNTER_COLUMNS}, practice_units ( id, name, code )`)
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

// ---------------------------------------------------------------------------
// Obstetric link — leitura e RPCs de vínculo. Sem update direto em encounters.
// ---------------------------------------------------------------------------

export async function getEncounterPregnancy(
  supabase: SupabaseClient,
  encounterId: string,
): Promise<PregnancyContext | null> {
  const { data: encounter, error: encounterError } = await supabase
    .from("encounters")
    .select("pregnancy_id")
    .eq("id", encounterId)
    .maybeSingle();
  if (encounterError || !encounter) return null;

  const pregnancyId = asString((encounter as { pregnancy_id?: unknown }).pregnancy_id);
  if (!pregnancyId) return null;

  const { data: pregnancy, error: pregnancyError } = await supabase
    .from("pregnancies")
    .select(PREGNANCY_CONTEXT_COLUMNS)
    .eq("id", pregnancyId)
    .maybeSingle();
  if (pregnancyError || !pregnancy) return null;
  return toPregnancyContext(pregnancy as Record<string, unknown>);
}

export async function linkEncounterToPregnancy(
  supabase: SupabaseClient,
  encounterId: string,
  pregnancyId: string,
): Promise<{ encounterId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("link_encounter_to_pregnancy", {
    p_encounter_id: encounterId,
    p_pregnancy_id: pregnancyId,
  });
  if (error) return { encounterId: null, error: mapAttendanceRpcError(error) };
  return {
    encounterId: typeof data === "string" ? data : null,
    error: null,
  };
}

export async function unlinkEncounterFromPregnancy(
  supabase: SupabaseClient,
  encounterId: string,
): Promise<{ encounterId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("unlink_encounter_from_pregnancy", {
    p_encounter_id: encounterId,
  });
  if (error) return { encounterId: null, error: mapAttendanceRpcError(error) };
  return {
    encounterId: typeof data === "string" ? data : null,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// C032.2 — Previsões (leitura staff + append versionado via RPC)
// ---------------------------------------------------------------------------

export const APPOINTMENT_PREDICTION_COLUMNS =
  "id, appointment_id, organization_id, practice_id, prediction_version, predicted_starts_at, predicted_ends_at, prediction_reason, calculated_at, created_by" as const;

export function toAppointmentPredictionRow(
  value: Record<string, unknown>,
): AppointmentPredictionRow | null {
  const id = asString(value.id);
  const appointmentId = asString(value.appointment_id);
  const organizationId = asString(value.organization_id);
  const practiceId = asString(value.practice_id);
  const predictionVersion = asNumber(value.prediction_version);
  const predictedStartsAt = asString(value.predicted_starts_at);
  const predictedEndsAt = asString(value.predicted_ends_at);
  const calculatedAt = asString(value.calculated_at);
  if (
    !id ||
    !appointmentId ||
    !organizationId ||
    !practiceId ||
    predictionVersion == null ||
    !predictedStartsAt ||
    !predictedEndsAt ||
    !calculatedAt
  ) {
    return null;
  }
  return {
    id,
    appointmentId,
    organizationId,
    practiceId,
    predictionVersion,
    predictedStartsAt,
    predictedEndsAt,
    predictionReason: asString(value.prediction_reason),
    calculatedAt,
    createdBy: asString(value.created_by),
  };
}

function toPredictionAppointment(row: AppointmentRow): PredictionAppointment {
  return {
    id: row.id,
    organizationId: row.organizationId,
    practiceId: row.practiceId,
    professionalId: row.professionalId,
    procedureId: row.procedureId,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: row.status,
    actualStartAt: row.actualStartAt,
    actualEndAt: row.actualEndAt,
  };
}

/** Catálogo duration_min da organização (uma consulta). */
export async function listProcedureDurationMinutes(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("procedures")
    .select("id, duration_min")
    .eq("organization_id", organizationId);
  const map = new Map<string, number>();
  if (error || !data) return map;
  for (const raw of data) {
    const row = raw as { id?: unknown; duration_min?: unknown };
    const id = asString(row.id);
    const minutes = asNumber(row.duration_min);
    if (id && minutes != null && minutes > 0) map.set(id, minutes);
  }
  return map;
}

/**
 * Amostras históricas efetivas (actual_start + actual_end) da prática.
 * Sem inventar dados; usadas só se >= MIN_HISTORICAL_SAMPLES no motor.
 */
export async function listHistoricalDurationSamples(
  supabase: SupabaseClient,
  practiceId: string,
  limit = 500,
): Promise<HistoricalDurationSample[]> {
  const { data, error } = await supabase
    .from("appointments")
    .select("procedure_id, professional_id, practice_id, actual_start_at, actual_end_at")
    .eq("practice_id", practiceId)
    .not("actual_start_at", "is", null)
    .not("actual_end_at", "is", null)
    .not("procedure_id", "is", null)
    .order("actual_end_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  const samples: HistoricalDurationSample[] = [];
  for (const raw of data) {
    const row = raw as Record<string, unknown>;
    const procedureId = asString(row.procedure_id);
    const professionalId = asString(row.professional_id);
    const rowPracticeId = asString(row.practice_id);
    const start = asString(row.actual_start_at);
    const end = asString(row.actual_end_at);
    if (!procedureId || !professionalId || !rowPracticeId || !start || !end) continue;
    const durationMin = Math.round(
      (new Date(end).getTime() - new Date(start).getTime()) / 60_000,
    );
    if (durationMin <= 0) continue;
    samples.push({
      procedureId,
      professionalId,
      practiceId: rowPracticeId,
      durationMin,
    });
  }
  return samples;
}

/** Última versão por appointment_id (staff SELECT). */
export async function listLatestAppointmentPredictions(
  supabase: SupabaseClient,
  appointmentIds: string[],
): Promise<Map<string, AppointmentPredictionRow>> {
  const map = new Map<string, AppointmentPredictionRow>();
  if (appointmentIds.length === 0) return map;
  const { data, error } = await supabase
    .from("appointment_predictions")
    .select(APPOINTMENT_PREDICTION_COLUMNS)
    .in("appointment_id", appointmentIds)
    .order("prediction_version", { ascending: false });
  if (error || !data) return map;
  for (const raw of data) {
    const row = toAppointmentPredictionRow(raw as Record<string, unknown>);
    if (!row || map.has(row.appointmentId)) continue;
    map.set(row.appointmentId, row);
  }
  return map;
}

export async function appendAppointmentPredictions(
  supabase: SupabaseClient,
  items: Array<{
    appointmentId: string;
    predictedStartsAt: string;
    predictedEndsAt: string;
    predictionReason: string | null;
  }>,
): Promise<{ rows: AppointmentPredictionRow[]; error: string | null }> {
  if (items.length === 0) return { rows: [], error: null };
  const { data, error } = await supabase.rpc("appointment_predictions_append", {
    p_items: items.map((item) => ({
      appointment_id: item.appointmentId,
      predicted_starts_at: item.predictedStartsAt,
      predicted_ends_at: item.predictedEndsAt,
      prediction_reason: item.predictionReason,
    })),
  });
  if (error) return { rows: [], error: mapAttendanceRpcError(error) };
  const rows = Array.isArray(data)
    ? data
        .map((raw) => toAppointmentPredictionRow(raw as Record<string, unknown>))
        .filter((item): item is AppointmentPredictionRow => Boolean(item))
    : [];
  return { rows, error: null };
}

/**
 * Calcula previsões do dia e persiste versões novas (sem tocar starts_at).
 * Retorna o view model operacional para a UI.
 */
export async function recalculateDayPredictions(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    practiceId: string;
    appointments: AppointmentRow[];
    persist?: boolean;
  },
): Promise<{
  predictions: AppointmentPredictionView[];
  persisted: number;
  error: string | null;
}> {
  const [catalog, historical] = await Promise.all([
    listProcedureDurationMinutes(supabase, input.organizationId),
    listHistoricalDurationSamples(supabase, input.practiceId),
  ]);

  const predictions = computeAgendaPredictions({
    appointments: input.appointments.map(toPredictionAppointment),
    catalogDurationMin: catalog,
    historicalSamples: historical,
  });

  if (!input.persist || predictions.length === 0) {
    return { predictions, persisted: 0, error: null };
  }

  const append = await appendAppointmentPredictions(
    supabase,
    predictions.map((item) => ({
      appointmentId: item.appointmentId,
      predictedStartsAt: item.predictedStartsAt,
      predictedEndsAt: item.predictedEndsAt,
      predictionReason: item.predictionReason,
    })),
  );

  return {
    predictions,
    persisted: append.rows.length,
    error: append.error,
  };
}
