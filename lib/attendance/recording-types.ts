/** Tipos C040.3 — gravação do encounter (separado de orientações C035). */

export const ENCOUNTER_RECORDING_BUCKET = "encounter-recordings" as const;

export const RECORDING_SESSION_STATUSES = [
  "recording",
  "paused",
  "completed",
  "failed",
] as const;
export type RecordingSessionStatus = (typeof RECORDING_SESSION_STATUSES)[number];

export const RECORDING_SEGMENT_STATUSES = [
  "pending_upload",
  "uploaded",
  "failed",
] as const;
export type RecordingSegmentStatus = (typeof RECORDING_SEGMENT_STATUSES)[number];

export const TRANSCRIPTION_STATUSES = [
  "pending",
  "processing",
  "available",
  "reviewed",
  "failed",
  "unavailable",
] as const;
export type EncounterTranscriptionStatus = (typeof TRANSCRIPTION_STATUSES)[number];

export type RecordingSessionRow = {
  id: string;
  organizationId: string;
  practiceId: string;
  patientId: string;
  encounterId: string;
  appointmentId: string | null;
  professionalId: string;
  sequenceNo: number;
  status: RecordingSessionStatus;
  startedAt: string;
  pausedAt: string | null;
  completedAt: string | null;
  totalDurationSeconds: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type RecordingSegmentRow = {
  id: string;
  sessionId: string;
  organizationId: string;
  practiceId: string;
  patientId: string;
  encounterId: string;
  sequenceNo: number;
  status: RecordingSegmentStatus;
  audioStoragePath: string | null;
  audioMimeType: string | null;
  audioByteSize: number | null;
  durationSeconds: number;
  cursorStartMs: number;
  cursorEndMs: number;
  createdBy: string;
  createdAt: string;
  uploadedAt: string | null;
};

export type RecordingTranscriptionRow = {
  id: string;
  segmentId: string;
  sessionId: string;
  organizationId: string;
  practiceId: string;
  patientId: string;
  encounterId: string;
  version: number;
  kind: "automatic" | "reviewed";
  status: EncounterTranscriptionStatus;
  provider: string | null;
  originalText: string | null;
  reviewedText: string | null;
  errorMessage: string | null;
  isSimulation: boolean;
  createdBy: string;
  createdAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
};

export type RecordingBundle = {
  sessions: RecordingSessionRow[];
  segments: RecordingSegmentRow[];
  transcriptions: RecordingTranscriptionRow[];
};
