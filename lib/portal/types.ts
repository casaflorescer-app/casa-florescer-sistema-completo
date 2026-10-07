/** Tipos sanitizados do portal da paciente (C038). Sem prediction_reason. */

import type { AppointmentStatus } from "@/lib/types/database";

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
  delayMinutes: number | null;
  isEarlier: boolean;
  hasPrediction: boolean;
};

export type PatientPortalPayload = {
  patientId: string;
  appointments: PatientPortalAppointment[];
};
