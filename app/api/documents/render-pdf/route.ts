import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  attachDocumentPdf,
  documentPdfPath,
  uploadDocumentPdf,
} from "@/lib/documents/directory";
import { buildClinicalDocumentPdf } from "@/lib/documents/pdf";
import {
  DOCUMENT_KINDS,
  DOCUMENT_SOURCE_TYPES,
  DOCUMENT_STATUSES,
  SIGNATURE_KIND_INTERNAL,
  type ClinicalDocumentRow,
  type DocumentKind,
  type DocumentSourceType,
  type DocumentStatus,
} from "@/lib/documents/types";

export const runtime = "nodejs";

function mapRow(raw: Record<string, unknown>): ClinicalDocumentRow | null {
  const id = typeof raw.id === "string" ? raw.id : null;
  const organizationId = typeof raw.organization_id === "string" ? raw.organization_id : null;
  const practiceId = typeof raw.practice_id === "string" ? raw.practice_id : null;
  const patientId = typeof raw.patient_id === "string" ? raw.patient_id : null;
  const professionalId = typeof raw.professional_id === "string" ? raw.professional_id : null;
  const sourceType = typeof raw.source_type === "string" ? raw.source_type : null;
  const sourceId = typeof raw.source_id === "string" ? raw.source_id : null;
  const documentKind = typeof raw.document_kind === "string" ? raw.document_kind : null;
  const status = typeof raw.status === "string" ? raw.status : null;
  const title = typeof raw.title === "string" ? raw.title : null;
  const issuedAt = typeof raw.issued_at === "string" ? raw.issued_at : null;
  const contentSha256 = typeof raw.content_sha256 === "string" ? raw.content_sha256 : null;
  const signedAt = typeof raw.signed_at === "string" ? raw.signed_at : null;
  const signedBy = typeof raw.signed_by === "string" ? raw.signed_by : null;
  const createdBy = typeof raw.created_by === "string" ? raw.created_by : null;
  const createdAt = typeof raw.created_at === "string" ? raw.created_at : null;
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
    !signedAt ||
    !signedBy ||
    !createdBy ||
    !createdAt ||
    !DOCUMENT_SOURCE_TYPES.includes(sourceType as DocumentSourceType) ||
    !DOCUMENT_KINDS.includes(documentKind as DocumentKind) ||
    !DOCUMENT_STATUSES.includes(status as DocumentStatus) ||
    !Number.isFinite(version)
  ) {
    return null;
  }
  return {
    id,
    organizationId,
    practiceId,
    patientId,
    encounterId: typeof raw.encounter_id === "string" ? raw.encounter_id : null,
    professionalId,
    sourceType: sourceType as DocumentSourceType,
    sourceId,
    documentKind: documentKind as DocumentKind,
    version,
    status: status as DocumentStatus,
    title,
    issuedAt,
    frozenPayload:
      raw.frozen_payload && typeof raw.frozen_payload === "object"
        ? (raw.frozen_payload as Record<string, unknown>)
        : {},
    contentSha256,
    pdfStoragePath: typeof raw.pdf_storage_path === "string" ? raw.pdf_storage_path : null,
    pdfSha256: typeof raw.pdf_sha256 === "string" ? raw.pdf_sha256 : null,
    signatureKind: SIGNATURE_KIND_INTERNAL,
    signedAt,
    signedBy,
    availableToPatient: Boolean(raw.available_to_patient),
    publishedToPatientAt:
      typeof raw.published_to_patient_at === "string" ? raw.published_to_patient_at : null,
    viewedByPatientAt:
      typeof raw.viewed_by_patient_at === "string" ? raw.viewed_by_patient_at : null,
    supersedesId: typeof raw.supersedes_id === "string" ? raw.supersedes_id : null,
    correctionReason: typeof raw.correction_reason === "string" ? raw.correction_reason : null,
    createdBy,
    createdAt,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { documentId?: string };
    const documentId = body.documentId?.trim();
    if (!documentId) {
      return NextResponse.json({ error: "documentId obrigatório." }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase indisponível." }, { status: 500 });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("clinical_document_artifacts")
      .select("*")
      .eq("id", documentId)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
    }

    const doc = mapRow(data as Record<string, unknown>);
    if (!doc) {
      return NextResponse.json({ error: "Documento inválido." }, { status: 400 });
    }
    if (doc.pdfStoragePath) {
      return NextResponse.json({ ok: true, alreadyAttached: true, documentId: doc.id });
    }

    const { bytes, sha256Hex } = await buildClinicalDocumentPdf(doc);
    const path = documentPdfPath(doc);
    const upload = await uploadDocumentPdf(supabase, path, bytes);
    if (upload.error) {
      return NextResponse.json({ error: upload.error }, { status: 400 });
    }

    const attached = await attachDocumentPdf(supabase, {
      documentId: doc.id,
      storagePath: path,
      pdfSha256: sha256Hex,
    });
    if (attached.error) {
      return NextResponse.json({ error: attached.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      documentId: doc.id,
      pdfSha256: sha256Hex,
      signatureKind: SIGNATURE_KIND_INTERNAL,
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Erro ao gerar PDF.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
