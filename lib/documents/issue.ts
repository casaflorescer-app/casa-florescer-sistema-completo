import type { SupabaseClient } from "@supabase/supabase-js";
import {
  issueDocumentFromExamRequest,
  issueDocumentFromOrientation,
  issueDocumentFromPrescription,
} from "@/lib/documents/directory";
import type { ClinicalDocumentRow } from "@/lib/documents/types";

async function renderAndAttachPdf(
  documentId: string,
): Promise<{ error: string | null }> {
  const response = await fetch("/api/documents/render-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentId }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok) {
    return { error: payload.error ?? "Falha ao gerar PDF do documento." };
  }
  return { error: null };
}

export async function issuePrescriptionDocumentWithPdf(
  supabase: SupabaseClient,
  input: {
    prescriptionId: string;
    shareWithPatient?: boolean;
    supersedesId?: string | null;
    correctionReason?: string | null;
  },
): Promise<{ row: ClinicalDocumentRow | null; error: string | null }> {
  const issued = await issueDocumentFromPrescription(supabase, input);
  if (issued.error || !issued.row) return issued;
  const pdf = await renderAndAttachPdf(issued.row.id);
  if (pdf.error) return { row: issued.row, error: `Documento emitido, PDF falhou: ${pdf.error}` };
  return issued;
}

export async function issueExamRequestDocumentWithPdf(
  supabase: SupabaseClient,
  input: {
    requestId: string;
    clinicalIndication?: string | null;
    shareWithPatient?: boolean;
    supersedesId?: string | null;
    correctionReason?: string | null;
  },
): Promise<{ row: ClinicalDocumentRow | null; error: string | null }> {
  const issued = await issueDocumentFromExamRequest(supabase, input);
  if (issued.error || !issued.row) return issued;
  const pdf = await renderAndAttachPdf(issued.row.id);
  if (pdf.error) return { row: issued.row, error: `Documento emitido, PDF falhou: ${pdf.error}` };
  return issued;
}

export async function issueOrientationDocumentWithPdf(
  supabase: SupabaseClient,
  input: {
    orientationId: string;
    shareWithPatient?: boolean;
    supersedesId?: string | null;
    correctionReason?: string | null;
  },
): Promise<{ row: ClinicalDocumentRow | null; error: string | null }> {
  const issued = await issueDocumentFromOrientation(supabase, input);
  if (issued.error || !issued.row) return issued;
  const pdf = await renderAndAttachPdf(issued.row.id);
  if (pdf.error) return { row: issued.row, error: `Documento emitido, PDF falhou: ${pdf.error}` };
  return issued;
}
