/** Tipos sanitizados do portal da paciente (C038/C039). Sem prediction_reason. */

import type { AppointmentStatus } from "@/lib/types/database";

/** Status amigável derivado — não é enum de banco. */
export type PatientJourneyStatus =
  | "scheduled"
  | "waiting"
  | "delayed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

export type PatientPortalAppointment = {
  appointmentId: string;
  organizationId: string;
  practiceId: string;
  scheduledStartsAt: string;
  scheduledEndsAt: string;
  status: AppointmentStatus;
  professionalName: string;
  procedureLabel: string;
  roomName: string | null;
  predictedStartsAt: string | null;
  predictedEndsAt: string | null;
  predictionUpdatedAt: string | null;
  delayMinutes: number | null;
  isEarlier: boolean;
  hasPrediction: boolean;
  hasArrived: boolean;
  actualStartAt: string | null;
  actualEndAt: string | null;
  journeyStatus: PatientJourneyStatus;
};

export type PatientPortalPayload = {
  patientId: string;
  appointments: PatientPortalAppointment[];
  notifyThresholdMin: number;
};

export type PatientNotificationCategory = "operational" | "clinical" | "relationship";
