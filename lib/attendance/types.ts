/** Tipos e rótulos do MVP C1 — Agenda / Encounter / Nota clínica. */

import type {
  AppointmentKind,
  AppointmentStatus,
  EncounterStatus,
} from "@/lib/types/database";

export const APPOINTMENT_STATUSES = [
  "scheduled",
  "confirmed",
  "checked_in",
  "in_progress",
  "completed",
  "no_show",
  "cancelled",
] as const satisfies readonly AppointmentStatus[];

export const OPERATIONAL_APPOINTMENT_STATUSES = [
  "scheduled",
  "confirmed",
  "checked_in",
  "cancelled",
  "no_show",
] as const satisfies readonly AppointmentStatus[];

/** Status clínicos da agenda — só via RPCs de encounter (não usar em ações administrativas). */
export const CLINICAL_APPOINTMENT_STATUSES = [
  "in_progress",
  "completed",
] as const satisfies readonly AppointmentStatus[];

export type OperationalAppointmentStatus =
  (typeof OPERATIONAL_APPOINTMENT_STATUSES)[number];

export function isOperationalAppointmentStatus(
  status: AppointmentStatus,
): status is OperationalAppointmentStatus {
  return (OPERATIONAL_APPOINTMENT_STATUSES as readonly AppointmentStatus[]).includes(
    status,
  );
}

export const ENCOUNTER_STATUSES = [
  "open",
  "signed",
  "amended",
  "cancelled",
] as const satisfies readonly EncounterStatus[];

export const DEFAULT_NOTE_TEMPLATE = "soap_min" as const;

export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  checked_in: "Check-in",
  in_progress: "Em atendimento",
  completed: "Concluído",
  no_show: "Não compareceu",
  cancelled: "Cancelado",
};

export const ENCOUNTER_STATUS_LABEL: Record<EncounterStatus, string> = {
  open: "Aberto",
  signed: "Assinado",
  amended: "Retificado",
  cancelled: "Cancelado",
};

export type AppointmentRow = {
  id: string;
  organizationId: string;
  practiceId: string;
  roomId: string;
  patientId: string;
  professionalId: string;
  procedureId: string | null;
  kind: AppointmentKind;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  urgencyNote: string | null;
  source: string;
  checkinAt: string | null;
  checkedInBy: string | null;
  createdBy: string;
  patientName?: string | null;
  professionalName?: string | null;
  roomName?: string | null;
};

export type EncounterRow = {
  id: string;
  organizationId: string;
  practiceId: string;
  appointmentId: string | null;
  patientId: string;
  professionalId: string;
  procedureId: string | null;
  status: EncounterStatus;
  signedAt: string | null;
  signedBy: string | null;
  createdAt: string;
  patientName?: string | null;
  professionalName?: string | null;
};

export type ClinicalNoteRow = {
  id: string;
  encounterId: string;
  organizationId: string;
  practiceId: string;
  /** Payload MVP (texto/JSON opaco). */
  body: string;
  templateCode: string | null;
  version: number;
  createdBy: string;
  createdAt: string;
};

export type CreateAppointmentInput = {
  organizationId: string;
  practiceId: string;
  roomId: string;
  patientId: string;
  professionalId: string;
  startsAt: string;
  endsAt: string;
  kind?: AppointmentKind;
  procedureId?: string | null;
  urgencyNote?: string | null;
  source?: string;
  createdBy: string;
};

export type AppointmentListFilter = {
  practiceId: string;
  /** ISO timestamptz inclusive lower bound. */
  from: string;
  /** ISO timestamptz exclusive upper bound. */
  to: string;
  professionalId?: string;
  status?: AppointmentStatus | AppointmentStatus[];
};
