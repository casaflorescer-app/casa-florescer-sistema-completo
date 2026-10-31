import type { SupabaseClient } from "@supabase/supabase-js";
import { isCasaBrowserAuth } from "@/lib/auth/casa-mode";
import { callCasaRpc } from "@/lib/casa/rpc";
import { listClinicalDocumentsCasa } from "@/lib/casa/module-data";
import {
  CLINICAL_DOCUMENT_BUCKET,
  DOCUMENT_KINDS,
  DOCUMENT_SOURCE_TYPES,
  DOCUMENT_STATUSES,
  SIGNATURE_KIND_INTERNAL,
  type ClinicalDocumentRow,
  type DocumentKind,
  type DocumentSourceType,
  type DocumentStatus,
  type SignatureKind,
} from "@/lib/documents/types";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function mapDocument(raw: Record<string, unknown>): ClinicalDocumentRow | null {
  const id = asString(raw.id);
  const organizationId = asString(raw.organization_id);
  const practiceId = asString(raw.practice_id);
  const patientId = asString(raw.patient_id);
  const professionalId = asString(raw.professional_id);
  const sourceType = asString(raw.source_type);
  const sourceId = asString(raw.source_id);
  const documentKind = asString(raw.document_kind);
  const status = asString(raw.status);
  const title = asString(raw.title);
  const issuedAt = asString(raw.issued_at);
  const contentSha256 = asString(raw.content_sha256);
  const signatureKind = asString(raw.signature_kind);
  const signedAt = asString(raw.signed_at);
  const signedBy = asString(raw.signed_by);
  const createdBy = asString(raw.created_by);
  const createdAt = asString(raw.created_at);
  const version = typeof raw.version === "number" ? raw.version : Number(raw.version);

  if (
    !id ||
    !organizationId ||
    !practiceId ||
    !patientId ||
    !professionalId ||
    !sourceType ||
    !sourceId ||
    !documentKind ||
    !status ||
    !title ||
    !issuedAt ||
    !contentSha256 ||
    !signatureKind ||
    !signedAt ||
    !signedBy ||
    !createdBy ||
    !createdAt ||
    !Number.isFinite(version)
  ) {
    return null;
  }

  if (!DOCUMENT_SOURCE_TYPES.includes(sourceType as DocumentSourceType)) return null;
  if (!DOCUMENT_KINDS.includes(documentKind as DocumentKind)) return null;
  if (!DOCUMENT_STATUSES.includes(status as DocumentStatus)) return null;
  if (signatureKind !== SIGNATURE_KIND_INTERNAL) return null;

  const frozen =
    raw.frozen_payload && typeof raw.frozen_payload === "object"
      ? (raw.frozen_payload as Record<string, unknown>)
      : {};

  return {
    id,
    organizationId,
    practiceId,
    patientId,
    encounterId: asString(raw.encounter_id),
    professionalId,
    sourceType: sourceType as DocumentSourceType,
    sourceId,
    documentKind: documentKind as DocumentKind,
    version,
    status: status as DocumentStatus,
    title,
    issuedAt,
    frozenPayload: frozen,
    contentSha256,
    pdfStoragePath: asString(raw.pdf_storage_path),
    pdfSha256: asString(raw.pdf_sha256),
    signatureKind: signatureKind as SignatureKind,
    signedAt,
    signedBy,
    availableToPatient: Boolean(raw.available_to_patient),
    publishedToPatientAt: asString(raw.published_to_patient_at),
    viewedByPatientAt: asString(raw.viewed_by_patient_at),
    supersedesId: asString(raw.supersedes_id),
    correctionReason: asString(raw.correction_reason),
    createdBy,
    createdAt,
  };
}

export function mapDocumentRpcError(error: { message?: string } | null): string {
  const message = error?.message ?? "";
  if (message.includes("DOCUMENT_IMMUTABLE")) {
    return "Documento finalizado é imutável. Emita uma correção (nova versão).";
  }
  if (message.includes("DOCUMENT_ALREADY_ISSUED")) {
    return "Já existe documento finalizado para esta origem. Use correção para nova versão.";
  }
  if (message.includes("DOCUMENT_DELETE_FORBIDDEN")) {
    return "Exclusão física de documento clínico não é permitida.";
  }
  if (message.includes("CORRECTION_REASON_REQUIRED")) {
    return "Informe o motivo da correção.";
  }
  if (message.includes("PRESCRIPTION_EMPTY")) return "Receita sem itens.";
  if (message.includes("EXAM_REQUEST_EMPTY")) return "Pedido de exames sem itens.";
  if (message.includes("ORIENTATION_NOT_PUBLISHED")) {
    return "Publique a orientação antes de emitir o documento.";
  }
  if (message.includes("ORIENTATION_TEXT_REQUIRED")) {
    return "Documento de orientação exige texto revisado (áudio isolado não basta).";
  }
  if (message.includes("ORIENTATION_NOT_FOUND")) return "Orientação não encontrada.";
  if (message.includes("FORBIDDEN")) return "Sem permissão para esta operação.";
  if (message.includes("DOCUMENT_PDF_ALREADY_ATTACHED")) {
    return "PDF já anexado a este documento.";
  }
  return message || "Não foi possível concluir a operação documental.";
}

export function documentPdfPath(doc: Pick<
  ClinicalDocumentRow,
  "organizationId" | "practiceId" | "patientId" | "id"
>): string {
  return `${doc.organizationId}/${doc.practiceId}/${doc.patientId}/${doc.id}/document.pdf`;
}

export async function listDocumentsForEncounter(
  supabase: SupabaseClient | null,
  encounterId: string,
): Promise<{ rows: ClinicalDocumentRow[]; error: string | null }> {
  if (!supabase) {
    if (!isCasaBrowserAuth()) return { rows: [], error: "Autenticação não configurada neste ambiente." };
    try {
      const data = await callCasaRpc("clinical_document_list_for_encounter", [encounterId]);
      const rows = (Array.isArray(data) ? data : [])
        .map((item) => mapDocument(item as Record<string, unknown>))
        .filter((item): item is ClinicalDocumentRow => Boolean(item));
      return { rows, error: null };
    } catch (error) {
      return { rows: [], error: error instanceof Error ? error.message : "Não foi possível listar os documentos." };
    }
  }
  const { data, error } = await supabase.rpc("clinical_document_list_for_encounter", {
    p_encounter_id: encounterId,
  });
  if (error) return { rows: [], error: mapDocumentRpcError(error) };
  const rows = (Array.isArray(data) ? data : [])
    .map((item) => mapDocument(item as Record<string, unknown>))
    .filter((item): item is ClinicalDocumentRow => Boolean(item));
  return { rows, error: null };
}

/** Lista documentos clínicos do paciente (RLS: can_read_clinical). Sem RPC nova. */
export async function listDocumentsForPatient(
  supabase: SupabaseClient | null,
  patientId: string,
  sourceType?: DocumentSourceType,
): Promise<{ rows: ClinicalDocumentRow[]; error: string | null }> {
  if (!supabase) {
    if (!isCasaBrowserAuth()) return { rows: [], error: "Autenticação não configurada neste ambiente." };
    const data = await listClinicalDocumentsCasa(patientId, sourceType);
    return {
      rows: data
        .map((row) => mapDocument(row))
        .filter((item): item is ClinicalDocumentRow => Boolean(item)),
      error: null,
    };
  }
  let query = supabase
    .from("clinical_document_artifacts")
    .select(
      "id, organization_id, practice_id, patient_id, encounter_id, professional_id, source_type, source_id, document_kind, version, status, title, issued_at, frozen_payload, content_sha256, pdf_storage_path, pdf_sha256, signature_kind, signed_at, signed_by, available_to_patient, published_to_patient_at, viewed_by_patient_at, supersedes_id, correction_reason, created_by, created_at",
    )
    .eq("patient_id", patientId)
    .order("issued_at", { ascending: false });
  if (sourceType) query = query.eq("source_type", sourceType);
  const { data, error } = await query;
  if (error) return { rows: [], error: mapDocumentRpcError(error) };
  const rows = (data ?? [])
    .map((item) => mapDocument(item as Record<string, unknown>))
    .filter((item): item is ClinicalDocumentRow => Boolean(item));
  return { rows, error: null };
}

export async function listDocumentsForPatientPortal(
  supabase: SupabaseClient,
): Promise<{ rows: ClinicalDocumentRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc("clinical_document_list_for_patient_portal");
  if (error) return { rows: [], error: mapDocumentRpcError(error) };
  const rows = (Array.isArray(data) ? data : [])
    .map((item) => mapDocument(item as Record<string, unknown>))
    .filter((item): item is ClinicalDocumentRow => Boolean(item));
  return { rows, error: null };
}

export async function issueDocumentFromPrescription(
  supabase: SupabaseClient | null,
  input: {
    prescriptionId: string;
    shareWithPatient?: boolean;
    supersedesId?: string | null;
    correctionReason?: string | null;
  },
): Promise<{ row: ClinicalDocumentRow | null; error: string | null }> {
  if (!supabase) {
    if (!isCasaBrowserAuth()) return { row: null, error: "Autenticação não configurada neste ambiente." };
    try {
      const data = await callCasaRpc("clinical_document_issue_from_prescription", [
        input.prescriptionId,
        input.shareWithPatient ?? true,
        input.supersedesId ?? null,
        input.correctionReason ?? null,
      ]);
      return {
        row: data && typeof data === "object" ? mapDocument(data as Record<string, unknown>) : null,
        error: null,
      };
    } catch (error) {
      return { row: null, error: error instanceof Error ? error.message : "Não foi possível emitir o documento." };
    }
  }
  const { data, error } = await supabase.rpc("clinical_document_issue_from_prescription", {
    p_prescription_id: input.prescriptionId,
    p_share_with_patient: input.shareWithPatient ?? true,
    p_supersedes_id: input.supersedesId ?? null,
    p_correction_reason: input.correctionReason ?? null,
  });
  if (error || !data) return { row: null, error: mapDocumentRpcError(error) };
  return { row: mapDocument(data as Record<string, unknown>), error: null };
}

export async function issueDocumentFromExamRequest(
  supabase: SupabaseClient | null,
  input: {
    requestId: string;
    clinicalIndication?: string | null;
    shareWithPatient?: boolean;
    supersedesId?: string | null;
    correctionReason?: string | null;
  },
): Promise<{ row: ClinicalDocumentRow | null; error: string | null }> {
  if (!supabase) {
    if (!isCasaBrowserAuth()) return { row: null, error: "Autenticação não configurada neste ambiente." };
    try {
      const data = await callCasaRpc("clinical_document_issue_from_exam_request", [
        input.requestId,
        input.clinicalIndication ?? null,
        input.shareWithPatient ?? false,
        input.supersedesId ?? null,
        input.correctionReason ?? null,
      ]);
      return {
        row: data && typeof data === "object" ? mapDocument(data as Record<string, unknown>) : null,
        error: null,
      };
    } catch (error) {
      return { row: null, error: error instanceof Error ? error.message : "Não foi possível emitir o documento." };
    }
  }
  const { data, error } = await supabase.rpc("clinical_document_issue_from_exam_request", {
    p_request_id: input.requestId,
    p_clinical_indication: input.clinicalIndication ?? null,
    p_share_with_patient: input.shareWithPatient ?? false,
    p_supersedes_id: input.supersedesId ?? null,
    p_correction_reason: input.correctionReason ?? null,
  });
  if (error || !data) return { row: null, error: mapDocumentRpcError(error) };
  return { row: mapDocument(data as Record<string, unknown>), error: null };
}

export async function issueDocumentFromOrientation(
  supabase: SupabaseClient | null,
  input: {
    orientationId: string;
    shareWithPatient?: boolean;
    supersedesId?: string | null;
    correctionReason?: string | null;
  },
): Promise<{ row: ClinicalDocumentRow | null; error: string | null }> {
  if (!supabase) {
    if (!isCasaBrowserAuth()) return { row: null, error: "Autenticação não configurada neste ambiente." };
    const data = await callCasaRpc("clinical_document_issue_from_orientation", [
      input.orientationId,
      input.shareWithPatient ?? false,
      input.supersedesId ?? null,
      input.correctionReason ?? null,
    ]);
    return { row: mapDocument(data as Record<string, unknown>), error: null };
  }
  const { data, error } = await supabase.rpc("clinical_document_issue_from_orientation", {
    p_orientation_id: input.orientationId,
    p_share_with_patient: input.shareWithPatient ?? false,
    p_supersedes_id: input.supersedesId ?? null,
    p_correction_reason: input.correctionReason ?? null,
  });
  if (error || !data) return { row: null, error: mapDocumentRpcError(error) };
  return { row: mapDocument(data as Record<string, unknown>), error: null };
}

export async function attachDocumentPdf(
  supabase: SupabaseClient | null,
  input: { documentId: string; storagePath: string; pdfSha256: string },
): Promise<{ row: ClinicalDocumentRow | null; error: string | null }> {
  if (!supabase) {
    try {
      const data = await callCasaRpc("clinical_document_attach_pdf", [
        input.documentId,
        input.storagePath,
        input.pdfSha256,
      ]);
      return { row: mapDocument(data as Record<string, unknown>), error: null };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Falha ao anexar o PDF.";
      return { row: null, error: message };
    }
  }
  const { data, error } = await supabase.rpc("clinical_document_attach_pdf", {
    p_document_id: input.documentId,
    p_storage_path: input.storagePath,
    p_pdf_sha256: input.pdfSha256,
  });
  if (error || !data) return { row: null, error: mapDocumentRpcError(error) };
  return { row: mapDocument(data as Record<string, unknown>), error: null };
}

export async function markDocumentViewed(
  supabase: SupabaseClient,
  documentId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("clinical_document_mark_viewed", {
    p_document_id: documentId,
  });
  return { error: error ? mapDocumentRpcError(error) : null };
}

export async function auditDocumentDownload(
  supabase: SupabaseClient | null,
  documentId: string,
): Promise<{ error: string | null }> {
  if (!supabase) {
    if (!isCasaBrowserAuth()) return { error: "Autenticação não configurada neste ambiente." };
    await callCasaRpc("clinical_document_audit_download", [documentId]);
    return { error: null };
  }
  const { error } = await supabase.rpc("clinical_document_audit_download", {
    p_document_id: documentId,
  });
  return { error: error ? mapDocumentRpcError(error) : null };
}

export async function createSignedDocumentUrl(
  supabase: SupabaseClient | null,
  storagePath: string,
  expiresIn = 120,
): Promise<{ url: string | null; error: string | null }> {
  if (!supabase) {
    if (!isCasaBrowserAuth()) return { url: null, error: "Autenticação não configurada neste ambiente." };
    const parts = storagePath.split("/");
    const documentId = parts.length >= 4 ? parts[3] : "";
    if (!documentId) return { url: null, error: "Documento não encontrado." };
    return { url: `/api/casa/files?kind=document&id=${documentId}`, error: null };
  }
  const { data, error } = await supabase.storage
    .from(CLINICAL_DOCUMENT_BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  if (error || !data?.signedUrl) {
    return { url: null, error: error?.message ?? "Não foi possível gerar URL assinada." };
  }
  return { url: data.signedUrl, error: null };
}

export async function uploadDocumentPdf(
  supabase: SupabaseClient | null,
  storagePath: string,
  bytes: Uint8Array,
): Promise<{ error: string | null }> {
  if (!supabase) {
    if (!isCasaBrowserAuth()) return { error: "Autenticação não configurada neste ambiente." };
    const body = new FormData();
    body.set("kind", "document");
    const id = storagePath.split("/")[3] ?? "";
    body.set("documentId", id);
    body.set("file", new Blob([Uint8Array.from(bytes)], { type: "application/pdf" }), "document.pdf");
    const response = await fetch("/api/casa/files", { method: "POST", body });
    if (!response.ok) return { error: "Não foi possível guardar o documento." };
    return { error: null };
  }
  const { error } = await supabase.storage.from(CLINICAL_DOCUMENT_BUCKET).upload(storagePath, bytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  return { error: error?.message ?? null };
}
