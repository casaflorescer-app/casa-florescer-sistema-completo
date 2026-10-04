export type ExamSource = "paciente" | "secretaria";

export type ExamClinicalStatus =
  | "RECEBIDO"
  | "DISPONIVEL_PARA_ANALISE"
  | "EM_ANALISE"
  | "ANALISADO"
  | "ORIENTACAO_PENDENTE"
  | "ORIENTACAO_PUBLICADA";

export type ExamOrderRow = {
  id: string;
  organizationId: string;
  practiceId: string;
  patientId: string;
  title: string;
  source: ExamSource;
  clinicalStatus: ExamClinicalStatus;
  observation: string | null;
  documentDate: string | null;
  encounterId: string | null;
  analysisNotes: string | null;
  analyzedAt: string | null;
  analyzedBy: string | null;
  receivedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ExamUploadRow = {
  id: string;
  examOrderId: string;
  storagePath: string;
  originalName: string;
  mimeType: string | null;
  uploadedAt: string;
};

export const CLINICAL_EXAM_BUCKET = "clinical-exams";

export const EXAM_CLINICAL_STATUS_LABEL: Record<ExamClinicalStatus, string> = {
  RECEBIDO: "Recebido",
  DISPONIVEL_PARA_ANALISE: "Aguardando análise",
  EM_ANALISE: "Em análise",
  ANALISADO: "Analisado",
  ORIENTACAO_PENDENTE: "Orientação pendente",
  ORIENTACAO_PUBLICADA: "Orientação publicada",
};
