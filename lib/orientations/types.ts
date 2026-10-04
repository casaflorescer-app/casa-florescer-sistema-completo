export type OrientationStatus = "draft" | "published" | "superseded" | "archived";
export type TranscriptionStatus =
  | "not_requested"
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "skipped"
  | "unavailable";
export type DeliveryMode = "TEXT_ONLY" | "AUDIO_ONLY" | "TEXT_AND_AUDIO";

export type ClinicalOrientationRow = {
  id: string;
  organizationId: string;
  practiceId: string;
  patientId: string;
  professionalId: string;
  encounterId: string | null;
  appointmentId: string | null;
  title: string;
  currentPublishedVersionId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ClinicalOrientationVersionRow = {
  id: string;
  orientationId: string;
  organizationId: string;
  practiceId: string;
  patientId: string;
  professionalId: string;
  version: number;
  status: OrientationStatus;
  audioStoragePath: string | null;
  audioMimeType: string | null;
  audioDurationSeconds: number | null;
  transcriptionStatus: TranscriptionStatus;
  transcriptionText: string | null;
  transcriptionError: string | null;
  finalText: string | null;
  deliveryMode: DeliveryMode | null;
  reviewedConfirmed: boolean;
  createdBy: string;
  createdAt: string;
  publishedAt: string | null;
  publishedBy: string | null;
  viewedAt: string | null;
  audioPlayedAt: string | null;
};

export type PatientNotificationRow = {
  id: string;
  organizationId: string;
  practiceId: string | null;
  patientId: string;
  eventType: string;
  title: string;
  message: string;
  referenceType: string | null;
  referenceId: string | null;
  readAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
};

export const CLINICAL_ORIENTATION_BUCKET = "clinical-orientations";

export const ORIENTATION_STATUS_LABEL: Record<OrientationStatus, string> = {
  draft: "Rascunho",
  published: "Publicada",
  superseded: "Substituída",
  archived: "Cancelada",
};
