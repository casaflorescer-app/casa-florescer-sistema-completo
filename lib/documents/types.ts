/** C040.7 — Documentos clínicos emitidos (artefatos). */

export const CLINICAL_DOCUMENT_BUCKET = "clinical-documents" as const;

export const DOCUMENT_SOURCE_TYPES = ["prescription", "exam_request", "orientation"] as const;
export type DocumentSourceType = (typeof DOCUMENT_SOURCE_TYPES)[number];

export const DOCUMENT_KINDS = ["receita", "solicitacao_exames", "orientacao"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_STATUSES = ["finalized", "superseded", "cancelled"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/** Somente validação interna nesta etapa — NÃO é ICP-Brasil. */
export const SIGNATURE_KIND_INTERNAL = "internal_system" as const;
export type SignatureKind = typeof SIGNATURE_KIND_INTERNAL;

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  receita: "Receita médica",
  solicitacao_exames: "Solicitação de exames",
  orientacao: "Orientação",
};

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  finalized: "Finalizado",
  superseded: "Substituído",
  cancelled: "Cancelado",
};

export const SIGNATURE_KIND_LABEL: Record<SignatureKind, string> = {
  internal_system: "Validação interna do sistema (não é assinatura digital ICP-Brasil)",
};

export type ClinicalDocumentRow = {
  id: string;
  organizationId: string;
  practiceId: string;
  patientId: string;
  encounterId: string | null;
  professionalId: string;
  sourceType: DocumentSourceType;
  sourceId: string;
  documentKind: DocumentKind;
  version: number;
  status: DocumentStatus;
  title: string;
  issuedAt: string;
  frozenPayload: Record<string, unknown>;
  contentSha256: string;
  pdfStoragePath: string | null;
  pdfSha256: string | null;
  signatureKind: SignatureKind;
  signedAt: string;
  signedBy: string;
  availableToPatient: boolean;
  publishedToPatientAt: string | null;
  viewedByPatientAt: string | null;
  supersedesId: string | null;
  correctionReason: string | null;
  createdBy: string;
  createdAt: string;
};
