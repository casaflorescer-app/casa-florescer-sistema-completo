import type { SupabaseClient } from "@supabase/supabase-js";
import { isCasaBrowserAuth } from "@/lib/auth/casa-mode";
import { callCasaRpc } from "@/lib/casa/rpc";
import { listExamOrdersCasa, listExamUploadsCasa } from "@/lib/casa/module-data";
import {
  CLINICAL_EXAM_BUCKET,
  type ExamClinicalStatus,
  type ExamOrderRow,
  type ExamSource,
  type ExamUploadRow,
} from "@/lib/exams/types";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function toOrder(value: Record<string, unknown>): ExamOrderRow | null {
  const id = asString(value.id);
  const organizationId = asString(value.organization_id);
  const practiceId = asString(value.practice_id);
  const patientId = asString(value.patient_id);
  const title = asString(value.title);
  const source = asString(value.source) as ExamSource | null;
  const clinicalStatus = asString(value.clinical_status) as ExamClinicalStatus | null;
  if (!id || !organizationId || !practiceId || !patientId || !title || !source || !clinicalStatus) {
    return null;
  }
  return {
    id,
    organizationId,
    practiceId,
    patientId,
    title,
    source,
    clinicalStatus,
    observation: asString(value.observation),
    documentDate: asString(value.document_date),
    encounterId: asString(value.encounter_id),
    analysisNotes: asString(value.analysis_notes),
    analyzedAt: asString(value.analyzed_at),
    analyzedBy: asString(value.analyzed_by),
    receivedAt: asString(value.received_at),
    createdAt: asString(value.created_at) ?? asString(value.requested_at),
    updatedAt: asString(value.updated_at),
  };
}

function toUpload(value: Record<string, unknown>): ExamUploadRow | null {
  const id = asString(value.id);
  const examOrderId = asString(value.exam_order_id);
  const storagePath = asString(value.storage_path);
  const originalName = asString(value.original_name);
  const uploadedAt = asString(value.uploaded_at);
  if (!id || !examOrderId || !storagePath || !originalName || !uploadedAt) return null;
  return {
    id,
    examOrderId,
    storagePath,
    originalName,
    mimeType: asString(value.mime_type),
    uploadedAt,
  };
}

export function mapExamRpcError(error: { message?: string } | null): string {
  const message = error?.message ?? "";
  if (message.includes("NOT_AUTHENTICATED")) return "Sessão expirada. Entre novamente.";
  if (message.includes("FORBIDDEN")) return "Sem permissão para este exame.";
  if (message.includes("EXAM_NOT_FOUND")) return "Exame não encontrado.";
  if (message.includes("EXAM_INVALID")) return "Dados do exame inválidos.";
  return message || "Não foi possível concluir a operação.";
}

export async function listExamOrdersForPatient(
  supabase: SupabaseClient | null,
  patientId: string,
): Promise<ExamOrderRow[]> {
  if (!supabase) {
    if (!isCasaBrowserAuth()) return [];
    const data = await listExamOrdersCasa(patientId);
    return data
      .map((row) => toOrder(row))
      .filter((item): item is ExamOrderRow => Boolean(item));
  }
  const { data, error } = await supabase
    .from("exam_orders")
    .select(
      "id, organization_id, practice_id, patient_id, title, source, clinical_status, observation, document_date, encounter_id, analysis_notes, analyzed_at, analyzed_by, received_at, requested_at, updated_at",
    )
    .eq("patient_id", patientId)
    .order("requested_at", { ascending: false });
  if (error || !data) return [];
  return data
    .map((row) => toOrder(row as Record<string, unknown>))
    .filter((item): item is ExamOrderRow => Boolean(item));
}

export async function listUploadsForOrder(
  supabase: SupabaseClient | null,
  examOrderId: string,
): Promise<ExamUploadRow[]> {
  if (!supabase) {
    if (!isCasaBrowserAuth()) return [];
    const data = await listExamUploadsCasa(examOrderId);
    return data
      .map((row) => toUpload(row))
      .filter((item): item is ExamUploadRow => Boolean(item));
  }
  const { data, error } = await supabase
    .from("exam_uploads")
    .select("id, exam_order_id, storage_path, original_name, mime_type, uploaded_at")
    .eq("exam_order_id", examOrderId)
    .order("uploaded_at", { ascending: false });
  if (error || !data) return [];
  return data
    .map((row) => toUpload(row as Record<string, unknown>))
    .filter((item): item is ExamUploadRow => Boolean(item));
}

export async function createSignedExamUrl(
  supabase: SupabaseClient | null,
  path: string,
  expiresIn = 120,
): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage
    .from(CLINICAL_EXAM_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function submitExamWithFile(
  supabase: SupabaseClient | null,
  input: {
    organizationId: string;
    practiceId: string;
    patientId: string;
    title: string;
    source: ExamSource;
    observation?: string;
    documentDate?: string;
    encounterId?: string | null;
    file: File;
  },
): Promise<{ order: ExamOrderRow | null; error: string | null }> {
  if (!supabase) {
    if (!isCasaBrowserAuth()) {
      return { order: null, error: "Autenticação não configurada neste ambiente." };
    }
    const body = new FormData();
    body.set("kind", "exam");
    body.set("organizationId", input.organizationId);
    body.set("practiceId", input.practiceId);
    body.set("patientId", input.patientId);
    body.set("title", input.title);
    body.set("source", input.source);
    if (input.observation) body.set("observation", input.observation);
    if (input.documentDate) body.set("documentDate", input.documentDate);
    if (input.encounterId) body.set("encounterId", input.encounterId);
    body.set("file", input.file);
    const response = await fetch("/api/casa/files", { method: "POST", body });
    if (!response.ok) return { order: null, error: "Não foi possível guardar o exame." };
    return { order: null, error: null };
  }
  const { data, error } = await supabase.rpc("exam_order_submit", {
    p_payload: {
      organization_id: input.organizationId,
      practice_id: input.practiceId,
      patient_id: input.patientId,
      title: input.title,
      source: input.source,
      observation: input.observation ?? null,
      document_date: input.documentDate ?? null,
      encounter_id: input.encounterId ?? null,
    },
  });
  if (error || !data) {
    return { order: null, error: mapExamRpcError(error) };
  }

  const payload = data as {
    order?: Record<string, unknown>;
    upload_id?: string;
    storage_path?: string;
  };
  const order = payload.order ? toOrder(payload.order) : null;
  const uploadId = payload.upload_id;
  const storagePath = payload.storage_path;
  if (!order || !uploadId || !storagePath) {
    return { order: null, error: "Resposta inválida ao criar exame." };
  }

  const { error: upErr } = await supabase.storage
    .from(CLINICAL_EXAM_BUCKET)
    .upload(storagePath, input.file, {
      upsert: true,
      contentType: input.file.type || "application/pdf",
    });
  if (upErr) {
    return { order: null, error: upErr.message };
  }

  const { error: regErr } = await supabase.rpc("exam_upload_register", {
    p_payload: {
      exam_order_id: order.id,
      upload_id: uploadId,
      storage_path: storagePath,
      original_name: input.file.name,
      mime_type: input.file.type || null,
      byte_size: input.file.size,
    },
  });
  if (regErr) return { order: null, error: mapExamRpcError(regErr) };
  return { order, error: null };
}

export async function markExamInAnalysis(
  supabase: SupabaseClient | null,
  examOrderId: string,
): Promise<{ error: string | null }> {
  if (!supabase) {
    if (!isCasaBrowserAuth()) return { error: "Autenticação não configurada neste ambiente." };
    try {
      await callCasaRpc("exam_mark_in_analysis", [examOrderId]);
      return { error: null };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Não foi possível concluir a operação.";
      return { error: message };
    }
  }
  const { error } = await supabase.rpc("exam_mark_in_analysis", {
    p_exam_order_id: examOrderId,
  });
  return { error: error ? mapExamRpcError(error) : null };
}

export async function markExamAnalyzed(
  supabase: SupabaseClient | null,
  examOrderId: string,
  analysisNotes?: string,
): Promise<{ order: ExamOrderRow | null; error: string | null }> {
  if (!supabase) {
    if (!isCasaBrowserAuth()) return { order: null, error: "Autenticação não configurada neste ambiente." };
    try {
      const data = await callCasaRpc("exam_mark_analyzed", [
        { exam_order_id: examOrderId, analysis_notes: analysisNotes ?? null },
      ]);
      return { order: data ? toOrder(data as Record<string, unknown>) : null, error: null };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Não foi possível concluir a operação.";
      return { order: null, error: message };
    }
  }
  const { data, error } = await supabase.rpc("exam_mark_analyzed", {
    p_payload: {
      exam_order_id: examOrderId,
      analysis_notes: analysisNotes ?? null,
    },
  });
  if (error) return { order: null, error: mapExamRpcError(error) };
  return {
    order: data ? toOrder(data as Record<string, unknown>) : null,
    error: null,
  };
}
