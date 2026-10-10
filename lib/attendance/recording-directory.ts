/** Persistência C040.3 — sessões/segmentos/transcrições do encounter. */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ENCOUNTER_RECORDING_BUCKET,
  type RecordingBundle,
  type RecordingSegmentRow,
  type RecordingSessionRow,
  type RecordingSessionStatus,
  type RecordingTranscriptionRow,
  type EncounterTranscriptionStatus,
  type RecordingSegmentStatus,
} from "@/lib/attendance/recording-types";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function asBool(value: unknown): boolean {
  return value === true;
}

function mapSession(raw: Record<string, unknown>): RecordingSessionRow | null {
  const id = asString(raw.id);
  const organizationId = asString(raw.organization_id);
  const practiceId = asString(raw.practice_id);
  const patientId = asString(raw.patient_id);
  const encounterId = asString(raw.encounter_id);
  const professionalId = asString(raw.professional_id);
  const status = asString(raw.status) as RecordingSessionStatus | null;
  const createdBy = asString(raw.created_by);
  const startedAt = asString(raw.started_at);
  const createdAt = asString(raw.created_at);
  const updatedAt = asString(raw.updated_at);
  if (
    !id ||
    !organizationId ||
    !practiceId ||
    !patientId ||
    !encounterId ||
    !professionalId ||
    !status ||
    !createdBy ||
    !startedAt ||
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
    encounterId,
    appointmentId: asString(raw.appointment_id),
    professionalId,
    sequenceNo: asNumber(raw.sequence_no, 1),
    status,
    startedAt,
    pausedAt: asString(raw.paused_at),
    completedAt: asString(raw.completed_at),
    totalDurationSeconds: asNumber(raw.total_duration_seconds),
    createdBy,
    createdAt,
    updatedAt,
  };
}

function mapSegment(raw: Record<string, unknown>): RecordingSegmentRow | null {
  const id = asString(raw.id);
  const sessionId = asString(raw.session_id);
  const organizationId = asString(raw.organization_id);
  const practiceId = asString(raw.practice_id);
  const patientId = asString(raw.patient_id);
  const encounterId = asString(raw.encounter_id);
  const status = asString(raw.status) as RecordingSegmentStatus | null;
  const createdBy = asString(raw.created_by);
  const createdAt = asString(raw.created_at);
  if (
    !id ||
    !sessionId ||
    !organizationId ||
    !practiceId ||
    !patientId ||
    !encounterId ||
    !status ||
    !createdBy ||
    !createdAt
  ) {
    return null;
  }
  return {
    id,
    sessionId,
    organizationId,
    practiceId,
    patientId,
    encounterId,
    sequenceNo: asNumber(raw.sequence_no, 1),
    status,
    audioStoragePath: asString(raw.audio_storage_path),
    audioMimeType: asString(raw.audio_mime_type),
    audioByteSize:
      typeof raw.audio_byte_size === "number" ? raw.audio_byte_size : null,
    durationSeconds: asNumber(raw.duration_seconds),
    cursorStartMs: asNumber(raw.cursor_start_ms),
    cursorEndMs: asNumber(raw.cursor_end_ms),
    createdBy,
    createdAt,
    uploadedAt: asString(raw.uploaded_at),
  };
}

function mapTranscription(raw: Record<string, unknown>): RecordingTranscriptionRow | null {
  const id = asString(raw.id);
  const segmentId = asString(raw.segment_id);
  const sessionId = asString(raw.session_id);
  const organizationId = asString(raw.organization_id);
  const practiceId = asString(raw.practice_id);
  const patientId = asString(raw.patient_id);
  const encounterId = asString(raw.encounter_id);
  const kind = asString(raw.kind);
  const status = asString(raw.status) as EncounterTranscriptionStatus | null;
  const createdBy = asString(raw.created_by);
  const createdAt = asString(raw.created_at);
  if (
    !id ||
    !segmentId ||
    !sessionId ||
    !organizationId ||
    !practiceId ||
    !patientId ||
    !encounterId ||
    (kind !== "automatic" && kind !== "reviewed") ||
    !status ||
    !createdBy ||
    !createdAt
  ) {
    return null;
  }
  return {
    id,
    segmentId,
    sessionId,
    organizationId,
    practiceId,
    patientId,
    encounterId,
    version: asNumber(raw.version, 1),
    kind,
    status,
    provider: asString(raw.provider),
    originalText: asString(raw.original_text),
    reviewedText: asString(raw.reviewed_text),
    errorMessage: asString(raw.error_message),
    isSimulation: asBool(raw.is_simulation),
    createdBy,
    createdAt,
    reviewedBy: asString(raw.reviewed_by),
    reviewedAt: asString(raw.reviewed_at),
  };
}

function mapRpcError(error: { message?: string } | null): string {
  const raw = error?.message ?? "Operação não permitida.";
  if (/NOT_AUTHENTICATED/i.test(raw)) return "Sessão expirada. Entre novamente.";
  if (/ENCOUNTER_NOT_OPEN/i.test(raw)) return "Atendimento assinado — gravação bloqueada.";
  if (/ENCOUNTER_OWNER_REQUIRED|FORBIDDEN/i.test(raw)) {
    return "Sem permissão para gravar neste atendimento.";
  }
  if (/RECORDING_ALREADY_ACTIVE/i.test(raw)) return "Já existe uma gravação ativa.";
  if (/SESSION_ALREADY_COMPLETED/i.test(raw)) return "Esta sessão já foi encerrada.";
  if (/SEGMENT_AUDIO_REQUIRED/i.test(raw)) return "Envie o áudio do segmento antes de transcrever.";
  if (/SHARE_CONTENT_REQUIRED/i.test(raw)) return "Selecione áudio e/ou transcrição.";
  return raw;
}

export async function listEncounterRecordings(
  supabase: SupabaseClient,
  encounterId: string,
): Promise<{ bundle: RecordingBundle; error: string | null }> {
  const { data, error } = await supabase.rpc("encounter_recording_list", {
    p_encounter_id: encounterId,
  });
  if (error) {
    return {
      bundle: { sessions: [], segments: [], transcriptions: [] },
      error: mapRpcError(error),
    };
  }
  const payload = (data ?? {}) as Record<string, unknown>;
  const sessions = Array.isArray(payload.sessions)
    ? payload.sessions
        .map((item) => mapSession(item as Record<string, unknown>))
        .filter((item): item is RecordingSessionRow => Boolean(item))
    : [];
  const segments = Array.isArray(payload.segments)
    ? payload.segments
        .map((item) => mapSegment(item as Record<string, unknown>))
        .filter((item): item is RecordingSegmentRow => Boolean(item))
    : [];
  const transcriptions = Array.isArray(payload.transcriptions)
    ? payload.transcriptions
        .map((item) => mapTranscription(item as Record<string, unknown>))
        .filter((item): item is RecordingTranscriptionRow => Boolean(item))
    : [];
  return { bundle: { sessions, segments, transcriptions }, error: null };
}

export async function startRecordingSession(
  supabase: SupabaseClient,
  encounterId: string,
): Promise<{ session: RecordingSessionRow | null; error: string | null }> {
  const { data, error } = await supabase.rpc("encounter_recording_start", {
    p_encounter_id: encounterId,
  });
  if (error || !data) return { session: null, error: mapRpcError(error) };
  return { session: mapSession(data as Record<string, unknown>), error: null };
}

export async function setRecordingSessionStatus(
  supabase: SupabaseClient,
  sessionId: string,
  status: "paused" | "recording" | "completed",
): Promise<{ session: RecordingSessionRow | null; error: string | null }> {
  const { data, error } = await supabase.rpc("encounter_recording_set_status", {
    p_session_id: sessionId,
    p_status: status,
  });
  if (error || !data) return { session: null, error: mapRpcError(error) };
  return { session: mapSession(data as Record<string, unknown>), error: null };
}

export async function registerRecordingSegment(
  supabase: SupabaseClient,
  input: {
    sessionId: string;
    durationSeconds: number;
    cursorStartMs: number;
    cursorEndMs: number;
    mimeType?: string;
  },
): Promise<{ segment: RecordingSegmentRow | null; error: string | null }> {
  const { data, error } = await supabase.rpc("encounter_recording_register_segment", {
    p_session_id: input.sessionId,
    p_duration_seconds: input.durationSeconds,
    p_cursor_start_ms: input.cursorStartMs,
    p_cursor_end_ms: input.cursorEndMs,
    p_mime_type: input.mimeType ?? null,
  });
  if (error || !data) return { segment: null, error: mapRpcError(error) };
  return { segment: mapSegment(data as Record<string, unknown>), error: null };
}

export async function uploadRecordingSegmentAudio(
  supabase: SupabaseClient,
  input: {
    segment: RecordingSegmentRow;
    blob: Blob;
    mimeType: string;
  },
): Promise<{ segment: RecordingSegmentRow | null; error: string | null }> {
  const path = input.segment.audioStoragePath;
  if (!path) return { segment: null, error: "Caminho de áudio ausente." };

  const { error: uploadError } = await supabase.storage
    .from(ENCOUNTER_RECORDING_BUCKET)
    .upload(path, input.blob, {
      contentType: input.mimeType || "audio/webm",
      upsert: true,
    });
  if (uploadError) {
    return { segment: null, error: uploadError.message || "Falha no upload do áudio." };
  }

  const { data, error } = await supabase.rpc("encounter_recording_mark_segment_uploaded", {
    p_segment_id: input.segment.id,
    p_byte_size: input.blob.size,
    p_mime_type: input.mimeType,
  });
  if (error || !data) return { segment: null, error: mapRpcError(error) };
  return { segment: mapSegment(data as Record<string, unknown>), error: null };
}

export async function requestSegmentTranscription(
  supabase: SupabaseClient,
  segmentId: string,
): Promise<{ transcription: RecordingTranscriptionRow | null; error: string | null }> {
  const { data, error } = await supabase.rpc("encounter_recording_request_transcription", {
    p_segment_id: segmentId,
  });
  if (error || !data) return { transcription: null, error: mapRpcError(error) };
  return { transcription: mapTranscription(data as Record<string, unknown>), error: null };
}

export async function reviewTranscription(
  supabase: SupabaseClient,
  transcriptionId: string,
  reviewedText: string,
): Promise<{ transcription: RecordingTranscriptionRow | null; error: string | null }> {
  const { data, error } = await supabase.rpc("encounter_recording_review_transcription", {
    p_transcription_id: transcriptionId,
    p_reviewed_text: reviewedText,
  });
  if (error || !data) return { transcription: null, error: mapRpcError(error) };
  return { transcription: mapTranscription(data as Record<string, unknown>), error: null };
}

export async function prepareRecordingShare(
  supabase: SupabaseClient,
  input: {
    encounterId: string;
    sessionId?: string | null;
    transcriptionId?: string | null;
    includeAudio: boolean;
    includeTranscription: boolean;
  },
): Promise<{ shareId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("encounter_recording_prepare_share", {
    p_encounter_id: input.encounterId,
    p_session_id: input.sessionId ?? null,
    p_transcription_id: input.transcriptionId ?? null,
    p_include_audio: input.includeAudio,
    p_include_transcription: input.includeTranscription,
  });
  if (error || !data) return { shareId: null, error: mapRpcError(error) };
  const id = asString((data as Record<string, unknown>).id);
  return { shareId: id, error: id ? null : "Falha ao preparar compartilhamento." };
}

export async function confirmRecordingShare(
  supabase: SupabaseClient,
  shareId: string,
  confirm: boolean,
): Promise<{ ok: boolean; error: string | null; status?: string }> {
  const { data, error } = await supabase.rpc("encounter_recording_confirm_share", {
    p_share_id: shareId,
    p_confirm: confirm,
  });
  if (error || !data) return { ok: false, error: mapRpcError(error) };
  return {
    ok: true,
    error: null,
    status: asString((data as Record<string, unknown>).status) ?? undefined,
  };
}

export async function createSignedRecordingAudioUrl(
  supabase: SupabaseClient,
  path: string,
  expiresIn = 120,
): Promise<{ url: string | null; error: string | null }> {
  const { data, error } = await supabase.storage
    .from(ENCOUNTER_RECORDING_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) {
    return { url: null, error: error?.message ?? "Não foi possível gerar o link do áudio." };
  }
  return { url: data.signedUrl, error: null };
}

/** Auditoria de reprodução efetiva — sem áudio/texto clínico no metadata. */
export async function markRecordingViewed(
  supabase: SupabaseClient,
  input: { sessionId: string; segmentId?: string | null },
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await supabase.rpc("encounter_recording_mark_viewed", {
    p_session_id: input.sessionId,
    p_segment_id: input.segmentId ?? null,
  });
  if (error) return { ok: false, error: mapRpcError(error) };
  return { ok: true, error: null };
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
