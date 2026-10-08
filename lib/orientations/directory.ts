import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CLINICAL_ORIENTATION_BUCKET,
  type ClinicalOrientationRow,
  type ClinicalOrientationVersionRow,
  type DeliveryMode,
  type OrientationStatus,
  type PatientNotificationRow,
  type TranscriptionStatus,
} from "@/lib/orientations/types";

export { CLINICAL_ORIENTATION_BUCKET } from "@/lib/orientations/types";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

function asStatus(value: unknown): OrientationStatus | null {
  if (
    value === "draft" ||
    value === "published" ||
    value === "superseded" ||
    value === "archived"
  ) {
    return value;
  }
  return null;
}

function asTranscription(value: unknown): TranscriptionStatus | null {
  if (
    value === "not_requested" ||
    value === "pending" ||
    value === "processing" ||
    value === "completed" ||
    value === "failed" ||
    value === "skipped" ||
    value === "unavailable"
  ) {
    return value;
  }
  return null;
}

function asDelivery(value: unknown): DeliveryMode | null {
  if (value === "TEXT_ONLY" || value === "AUDIO_ONLY" || value === "TEXT_AND_AUDIO") {
    return value;
  }
  return null;
}

export function mapOrientationRpcError(error: { message?: string } | null): string {
  const message = error?.message ?? "";
  if (message.includes("NOT_AUTHENTICATED")) return "Sessão expirada. Entre novamente.";
  if (message.includes("PROFILE_INACTIVE")) return "Perfil inativo.";
  if (message.includes("FORBIDDEN") || message.includes("PROFESSIONAL_MISMATCH")) {
    return "Você não possui permissão para esta orientação.";
  }
  if (message.includes("ORIENTATION_NOT_DRAFT")) {
    return "Somente rascunhos podem ser editados ou cancelados.";
  }
  if (message.includes("ORIENTATION_NOT_REVIEWED")) {
    return "Confirme a revisão antes de publicar.";
  }
  if (message.includes("ORIENTATION_TEXT_REQUIRED")) {
    return "Informe o texto final da orientação.";
  }
  if (message.includes("ORIENTATION_DELIVERY_REQUIRED")) {
    return "Escolha se a paciente receberá texto, áudio ou ambos.";
  }
  if (message.includes("ORIENTATION_AUDIO_REQUIRED")) {
    return "Para publicar com áudio, grave e salve o áudio original.";
  }
  if (message.includes("ORIENTATION_DRAFT_EXISTS")) {
    return "Já existe um rascunho. Finalize, cancele ou continue o rascunho atual.";
  }
  if (message.includes("ORIENTATION_NOT_FOUND")) return "Orientação não encontrada.";
  if (message.includes("ORIENTATION_AUDIO_NOT_AVAILABLE")) {
    return "Áudio não disponível para esta orientação.";
  }
  return message || "Não foi possível concluir a operação.";
}

export function toOrientationRow(value: Record<string, unknown>): ClinicalOrientationRow | null {
  const id = asString(value.id);
  const organizationId = asString(value.organization_id);
  const practiceId = asString(value.practice_id);
  const patientId = asString(value.patient_id);
  const professionalId = asString(value.professional_id);
  const title = asString(value.title) ?? "Orientação clínica";
  const createdBy = asString(value.created_by);
  const createdAt = asString(value.created_at);
  const updatedAt = asString(value.updated_at);
  if (
    !id ||
    !organizationId ||
    !practiceId ||
    !patientId ||
    !professionalId ||
    !createdBy ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }
  return {
    id,
    organizationId,
    practiceId,
    patientId,
    professionalId,
    encounterId: asString(value.encounter_id),
    appointmentId: asString(value.appointment_id),
    title,
    currentPublishedVersionId: asString(value.current_published_version_id),
    createdBy,
    createdAt,
    updatedAt,
  };
}

export function toVersionRow(value: Record<string, unknown>): ClinicalOrientationVersionRow | null {
  const id = asString(value.id);
  const orientationId = asString(value.orientation_id);
  const organizationId = asString(value.organization_id);
  const practiceId = asString(value.practice_id);
  const patientId = asString(value.patient_id);
  const professionalId = asString(value.professional_id);
  const version = asNumber(value.version);
  const status = asStatus(value.status);
  const transcriptionStatus = asTranscription(value.transcription_status) ?? "pending";
  const createdBy = asString(value.created_by);
  const createdAt = asString(value.created_at);
  if (
    !id ||
    !orientationId ||
    !organizationId ||
    !practiceId ||
    !patientId ||
    !professionalId ||
    version == null ||
    !status ||
    !createdBy ||
    !createdAt
  ) {
    return null;
  }
  return {
    id,
    orientationId,
    organizationId,
    practiceId,
    patientId,
    professionalId,
    version,
    status,
    audioStoragePath: asString(value.audio_storage_path),
    audioMimeType: asString(value.audio_mime_type),
    audioDurationSeconds: asNumber(value.audio_duration_seconds),
    transcriptionStatus,
    transcriptionText: asString(value.transcription_text),
    transcriptionError: asString(value.transcription_error),
    finalText: asString(value.final_text),
    deliveryMode: asDelivery(value.delivery_mode),
    reviewedConfirmed: value.reviewed_confirmed === true,
    createdBy,
    createdAt,
    publishedAt: asString(value.published_at),
    publishedBy: asString(value.published_by),
    viewedAt: asString(value.viewed_at),
    audioPlayedAt: asString(value.audio_played_at),
  };
}

export function orientationAudioPath(input: {
  organizationId: string;
  patientId: string;
  orientationId: string;
  versionId: string;
}): string {
  return `${input.organizationId}/${input.patientId}/${input.orientationId}/${input.versionId}/audio`;
}

export async function listOrientationsForPatient(
  supabase: SupabaseClient,
  patientId: string,
): Promise<ClinicalOrientationRow[]> {
  const { data, error } = await supabase
    .from("clinical_orientations")
    .select(
      "id, organization_id, practice_id, patient_id, professional_id, encounter_id, appointment_id, title, current_published_version_id, created_by, created_at, updated_at",
    )
    .eq("patient_id", patientId)
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  return data
    .map((raw) => toOrientationRow(raw as Record<string, unknown>))
    .filter((item): item is ClinicalOrientationRow => Boolean(item));
}

export async function listOrientationsForEncounter(
  supabase: SupabaseClient,
  encounterId: string,
): Promise<ClinicalOrientationRow[]> {
  const { data, error } = await supabase
    .from("clinical_orientations")
    .select(
      "id, organization_id, practice_id, patient_id, professional_id, encounter_id, appointment_id, title, current_published_version_id, created_by, created_at, updated_at",
    )
    .eq("encounter_id", encounterId)
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  return data
    .map((raw) => toOrientationRow(raw as Record<string, unknown>))
    .filter((item): item is ClinicalOrientationRow => Boolean(item));
}

/** Staff: all versions (incl. transcrição) via RPC — paciente sem GRANT nas colunas de transcrição. */
export async function listOrientationVersions(
  supabase: SupabaseClient,
  orientationId: string,
): Promise<ClinicalOrientationVersionRow[]> {
  const { data, error } = await supabase.rpc("clinical_orientation_versions_list", {
    p_orientation_id: orientationId,
  });
  if (error || !data) return [];
  return (data as Record<string, unknown>[])
    .map((raw) => toVersionRow(raw))
    .filter((item): item is ClinicalOrientationVersionRow => Boolean(item));
}

/** Patient: published projection only (no transcription_text selected). */
export async function listPublishedOrientationsForPatient(
  supabase: SupabaseClient,
  patientId: string,
): Promise<
  Array<{
    orientation: ClinicalOrientationRow;
    version: ClinicalOrientationVersionRow;
  }>
> {
  const { data, error } = await supabase
    .from("clinical_orientations")
    .select(
      `
      id, organization_id, practice_id, patient_id, professional_id, encounter_id, appointment_id, title, current_published_version_id, created_by, created_at, updated_at,
      clinical_orientation_versions!clinical_orientations_current_published_fk (
        id, orientation_id, organization_id, practice_id, patient_id, professional_id, version, status,
        audio_storage_path, audio_mime_type, audio_duration_seconds, transcription_status,
        final_text, delivery_mode, reviewed_confirmed, created_by, created_at,
        published_at, published_by, viewed_at, audio_played_at
      )
    `,
    )
    .eq("patient_id", patientId)
    .not("current_published_version_id", "is", null)
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  return data.flatMap((raw) => {
    const record = raw as Record<string, unknown>;
    const orientation = toOrientationRow(record);
    const nested = record.clinical_orientation_versions;
    const versionRaw = Array.isArray(nested)
      ? (nested[0] as Record<string, unknown> | undefined)
      : (nested as Record<string, unknown> | null);
    const version = versionRaw ? toVersionRow(versionRaw) : null;
    if (!orientation || !version || version.status !== "published") return [];
    // Paciente: áudio só quando a médica autorizou AUDIO_ONLY ou TEXT_AND_AUDIO.
    const safeVersion =
      version.deliveryMode === "TEXT_AND_AUDIO" || version.deliveryMode === "AUDIO_ONLY"
        ? version
        : { ...version, audioStoragePath: null, audioMimeType: null };
    return [{ orientation, version: safeVersion }];
  });
}

export async function createClinicalOrientation(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    practiceId: string;
    patientId: string;
    professionalId: string;
    encounterId?: string | null;
    appointmentId?: string | null;
    title?: string;
  },
): Promise<{
  orientation: ClinicalOrientationRow | null;
  version: ClinicalOrientationVersionRow | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc("clinical_orientation_create", {
    p_payload: {
      organization_id: input.organizationId,
      practice_id: input.practiceId,
      patient_id: input.patientId,
      professional_id: input.professionalId,
      encounter_id: input.encounterId ?? null,
      appointment_id: input.appointmentId ?? null,
      title: input.title ?? "Orientação clínica",
    },
  });
  if (error) {
    return { orientation: null, version: null, error: mapOrientationRpcError(error) };
  }
  const payload = data as { orientation?: Record<string, unknown>; version?: Record<string, unknown> };
  return {
    orientation: payload.orientation ? toOrientationRow(payload.orientation) : null,
    version: payload.version ? toVersionRow(payload.version) : null,
    error: null,
  };
}

export async function saveOrientationDraft(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<{ version: ClinicalOrientationVersionRow | null; error: string | null }> {
  const { data, error } = await supabase.rpc("clinical_orientation_save_draft", {
    p_payload: payload,
  });
  if (error) return { version: null, error: mapOrientationRpcError(error) };
  return {
    version: data ? toVersionRow(data as Record<string, unknown>) : null,
    error: null,
  };
}

export async function publishOrientation(
  supabase: SupabaseClient,
  versionId: string,
): Promise<{ version: ClinicalOrientationVersionRow | null; error: string | null }> {
  const { data, error } = await supabase.rpc("clinical_orientation_publish", {
    p_version_id: versionId,
  });
  if (error) return { version: null, error: mapOrientationRpcError(error) };
  return {
    version: data ? toVersionRow(data as Record<string, unknown>) : null,
    error: null,
  };
}

export async function createOrientationNewVersion(
  supabase: SupabaseClient,
  orientationId: string,
): Promise<{ version: ClinicalOrientationVersionRow | null; error: string | null }> {
  const { data, error } = await supabase.rpc("clinical_orientation_new_version", {
    p_orientation_id: orientationId,
  });
  if (error) return { version: null, error: mapOrientationRpcError(error) };
  return {
    version: data ? toVersionRow(data as Record<string, unknown>) : null,
    error: null,
  };
}

/** Cancels a draft version (status → archived). Never touches published history. */
export async function cancelOrientationDraft(
  supabase: SupabaseClient,
  versionId: string,
): Promise<{ version: ClinicalOrientationVersionRow | null; error: string | null }> {
  const { data, error } = await supabase.rpc("clinical_orientation_cancel_draft", {
    p_version_id: versionId,
  });
  if (error) return { version: null, error: mapOrientationRpcError(error) };
  return {
    version: data ? toVersionRow(data as Record<string, unknown>) : null,
    error: null,
  };
}

export async function uploadOrientationAudio(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    patientId: string;
    orientationId: string;
    versionId: string;
    blob: Blob;
    mimeType: string;
    durationSeconds?: number | null;
  },
): Promise<{ path: string | null; error: string | null }> {
  const path = orientationAudioPath(input);
  const { error: uploadError } = await supabase.storage
    .from(CLINICAL_ORIENTATION_BUCKET)
    .upload(path, input.blob, {
      upsert: true,
      contentType: input.mimeType || "audio/webm",
    });
  if (uploadError) return { path: null, error: uploadError.message };

  const saved = await saveOrientationDraft(supabase, {
    version_id: input.versionId,
    audio_storage_path: path,
    audio_mime_type: input.mimeType || "audio/webm",
    audio_duration_seconds: input.durationSeconds ?? null,
  });
  if (saved.error) return { path: null, error: saved.error };
  return { path, error: null };
}

export async function createSignedOrientationAudioUrl(
  supabase: SupabaseClient,
  path: string,
  expiresIn = 120,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(CLINICAL_ORIENTATION_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function markOrientationViewed(
  supabase: SupabaseClient,
  versionId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("clinical_orientation_mark_viewed", {
    p_version_id: versionId,
  });
  return { error: error ? mapOrientationRpcError(error) : null };
}

export async function markOrientationAudioPlayed(
  supabase: SupabaseClient,
  versionId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("clinical_orientation_mark_audio_played", {
    p_version_id: versionId,
  });
  return { error: error ? mapOrientationRpcError(error) : null };
}

export async function listPatientNotifications(
  supabase: SupabaseClient,
  limit = 20,
): Promise<PatientNotificationRow[]> {
  const { data, error } = await supabase
    .from("patient_notifications")
    .select(
      "id, organization_id, practice_id, patient_id, event_type, title, message, reference_type, reference_id, read_at, dismissed_at, created_at",
    )
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.flatMap((raw) => {
    const value = raw as Record<string, unknown>;
    const id = asString(value.id);
    const organizationId = asString(value.organization_id);
    const patientId = asString(value.patient_id);
    const eventType = asString(value.event_type);
    const title = asString(value.title);
    const message = asString(value.message);
    const createdAt = asString(value.created_at);
    if (!id || !organizationId || !patientId || !eventType || !title || !message || !createdAt) {
      return [];
    }
    return [
      {
        id,
        organizationId,
        practiceId: asString(value.practice_id),
        patientId,
        eventType,
        title,
        message,
        referenceType: asString(value.reference_type),
        referenceId: asString(value.reference_id),
        readAt: asString(value.read_at),
        dismissedAt: asString(value.dismissed_at),
        createdAt,
      },
    ];
  });
}

export async function dismissPatientNotification(
  supabase: SupabaseClient,
  notificationId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("patient_notification_dismiss", {
    p_notification_id: notificationId,
  });
  return { error: error ? mapOrientationRpcError(error) : null };
}

export async function markPatientNotificationRead(
  supabase: SupabaseClient,
  notificationId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("patient_notification_mark_read", {
    p_notification_id: notificationId,
  });
  return { error: error ? mapOrientationRpcError(error) : null };
}

export async function linkOrientationExams(
  supabase: SupabaseClient,
  orientationId: string,
  examOrderIds: string[],
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("clinical_orientation_link_exams", {
    p_orientation_id: orientationId,
    p_exam_order_ids: examOrderIds,
  });
  return { error: error ? mapOrientationRpcError(error) : null };
}

export async function submitOrientationFeedback(
  supabase: SupabaseClient,
  input: {
    orientationId: string;
    orientationVersionId: string;
    kind: "understood" | "clarification_request";
    message?: string;
  },
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("orientation_feedback_submit", {
    p_payload: {
      orientation_id: input.orientationId,
      orientation_version_id: input.orientationVersionId,
      kind: input.kind,
      message: input.message ?? null,
    },
  });
  return { error: error ? mapOrientationRpcError(error) : null };
}

export type OrientationFeedbackRow = {
  id: string;
  orientationId: string;
  kind: string;
  message: string | null;
  status: string;
  createdAt: string;
};

export async function listOpenFeedbackForPatient(
  supabase: SupabaseClient,
  patientId: string,
): Promise<OrientationFeedbackRow[]> {
  const { data, error } = await supabase
    .from("orientation_feedback")
    .select("id, orientation_id, kind, message, status, created_at")
    .eq("patient_id", patientId)
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.flatMap((raw) => {
    const value = raw as Record<string, unknown>;
    const id = asString(value.id);
    const orientationId = asString(value.orientation_id);
    const kind = asString(value.kind);
    const status = asString(value.status);
    const createdAt = asString(value.created_at);
    if (!id || !orientationId || !kind || !status || !createdAt) return [];
    return [
      {
        id,
        orientationId,
        kind,
        message: asString(value.message),
        status,
        createdAt,
      },
    ];
  });
}

export async function listLinkedExamIds(
  supabase: SupabaseClient,
  orientationId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("clinical_orientation_exams")
    .select("exam_order_id")
    .eq("orientation_id", orientationId);
  if (error || !data) return [];
  return data
    .map((row) => asString((row as Record<string, unknown>).exam_order_id))
    .filter((id): id is string => Boolean(id));
}
