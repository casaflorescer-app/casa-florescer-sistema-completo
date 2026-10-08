/** Resumo clínico objetivo para o Workspace Médico (C040.1). Sem migration. */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ageFromBirthDate, formatIsoDateBr } from "@/lib/patients/format";
import { getPatient } from "@/lib/patients/directory";
import { listExamOrdersForPatient } from "@/lib/exams/directory";
import { listOrientationsForPatient } from "@/lib/orientations/directory";
import { listPrescriptionsForPatient } from "@/lib/prescriptions/directory";
import {
  ENCOUNTER_STATUS_LABEL,
  listEncountersForPatient,
  type EncounterRow,
  type PregnancyContext,
} from "@/lib/attendance/directory";
import { formatDateTime } from "@/lib/platform/format";

export type PatientClinicalSummaryData = {
  fullName: string;
  birthDate: string | null;
  ageYears: number | null;
  phone: string | null;
  allergies: string | null;
  continuousMedications: string | null;
  comorbidities: string | null;
  gpa: { pregnancies: number; births: number; abortions: number } | null;
  lmpDate: string | null;
  edd: string | null;
  gynProcedures: string[];
  lastEncounter: { id: string; createdAt: string; statusLabel: string } | null;
  recentExams: { id: string; title: string; when: string }[];
  recentPrescriptions: { id: string; status: string; when: string }[];
  recentOrientations: { id: string; title: string; when: string }[];
};

export async function loadPatientClinicalSummary(
  supabase: SupabaseClient,
  input: {
    practiceId: string;
    patientId: string;
    currentEncounterId: string;
    pregnancy: PregnancyContext | null;
  },
): Promise<PatientClinicalSummaryData | null> {
  const patient = await getPatient(supabase, input.patientId);
  if (!patient) return null;

  const [{ data: clinical }, encounters, exams, prescriptions, orientations] = await Promise.all([
    supabase
      .from("patient_clinical_data")
      .select(
        "allergies, continuous_medications, comorbidities, pregnancies, births, abortions, lmp_date, edd, gyn_procedures",
      )
      .eq("patient_id", input.patientId)
      .maybeSingle(),
    listEncountersForPatient(supabase, input.practiceId, input.patientId),
    listExamOrdersForPatient(supabase, input.patientId).catch(() => []),
    listPrescriptionsForPatient(supabase, input.patientId).catch(() => []),
    listOrientationsForPatient(supabase, input.patientId).catch(() => []),
  ]);

  const prior = encounters.find((item) => item.id !== input.currentEncounterId) ?? null;
  const clinicalRow = clinical as Record<string, unknown> | null;

  return {
    fullName: patient.fullName,
    birthDate: patient.birthDate,
    ageYears: patient.birthDate ? ageFromBirthDate(patient.birthDate) : null,
    phone: patient.phone,
    allergies: typeof clinicalRow?.allergies === "string" ? clinicalRow.allergies : null,
    continuousMedications:
      typeof clinicalRow?.continuous_medications === "string"
        ? clinicalRow.continuous_medications
        : null,
    comorbidities:
      typeof clinicalRow?.comorbidities === "string" ? clinicalRow.comorbidities : null,
    gpa:
      clinicalRow &&
      typeof clinicalRow.pregnancies === "number" &&
      typeof clinicalRow.births === "number" &&
      typeof clinicalRow.abortions === "number"
        ? {
            pregnancies: clinicalRow.pregnancies,
            births: clinicalRow.births,
            abortions: clinicalRow.abortions,
          }
        : null,
    lmpDate: typeof clinicalRow?.lmp_date === "string" ? clinicalRow.lmp_date : null,
    edd:
      typeof clinicalRow?.edd === "string"
        ? clinicalRow.edd
        : input.pregnancy?.clinicalDueDate ?? input.pregnancy?.estimatedDueDate ?? null,
    gynProcedures: Array.isArray(clinicalRow?.gyn_procedures)
      ? (clinicalRow!.gyn_procedures as string[])
      : [],
    lastEncounter: prior
      ? {
          id: prior.id,
          createdAt: prior.createdAt,
          statusLabel: ENCOUNTER_STATUS_LABEL[prior.status],
        }
      : null,
    recentExams: exams.slice(0, 3).map((item) => ({
      id: item.id,
      title: item.title,
      when: item.documentDate || item.receivedAt || item.updatedAt || item.createdAt || "",
    })),
    recentPrescriptions: prescriptions.slice(0, 3).map((item) => ({
      id: item.id,
      status: item.status,
      when: item.publishedToPatientAt || item.signedAt || item.createdAt,
    })),
    recentOrientations: orientations.slice(0, 3).map((item) => ({
      id: item.id,
      title: item.title,
      when: item.updatedAt || item.createdAt,
    })),
  };
}

export function formatSummaryWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return formatIsoDateBr(iso) || iso;
  return formatDateTime(iso);
}

export type TimelineEncounterItem = {
  encounter: EncounterRow;
  label: string;
};

export function toTimelineItems(encounters: EncounterRow[]): TimelineEncounterItem[] {
  return encounters.map((encounter) => ({
    encounter,
    label:
      encounter.status === "open"
        ? "Atendimento em andamento"
        : encounter.status === "signed"
          ? "Consulta"
          : ENCOUNTER_STATUS_LABEL[encounter.status],
  }));
}