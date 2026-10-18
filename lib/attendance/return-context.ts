/** C055 — contexto somente leitura do atendimento de origem do retorno. */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getEncounter,
  getLatestClinicalNote,
  listReturnsOfEncounter,
  type EncounterRow,
} from "@/lib/attendance/directory";
import { DEFAULT_NOTE_TEMPLATE } from "@/lib/attendance/types";
import {
  TEMPLATE_ANAMNESIS_ENCOUNTER,
  TEMPLATE_CHIEF_COMPLAINT,
  TEMPLATE_PHYSICAL_EXAM,
  parseAnamnesis,
  parseChiefComplaint,
  parsePhysicalExam,
  type AnamnesisEncounterForm,
  type ChiefComplaintForm,
  type PhysicalExamForm,
} from "@/lib/attendance/clinical-forms";
import { soapFromBody, type SoapNote } from "@/components/attendance/soap";
import { listExamRequestsForEncounter } from "@/lib/attendance/clinical-support-directory";
import { listPrescriptionsForPatient } from "@/lib/prescriptions/directory";
import { listOrientationsForEncounter } from "@/lib/orientations/directory";

export type PriorEncounterContext = {
  encounter: EncounterRow;
  chiefComplaint: ChiefComplaintForm | null;
  anamnesis: AnamnesisEncounterForm | null;
  physicalExam: PhysicalExamForm | null;
  soap: SoapNote | null;
  prescriptionsCount: number;
  examRequestsCount: number;
  orientationsCount: number;
};

export async function loadPriorEncounterContext(
  supabase: SupabaseClient,
  sourceEncounterId: string,
): Promise<PriorEncounterContext | null> {
  const encounter = await getEncounter(supabase, sourceEncounterId);
  if (!encounter) return null;

  const [complaintNote, anamnesisNote, examNote, soapNote, examRequests, orientations, prescriptions] =
    await Promise.all([
      getLatestClinicalNote(supabase, sourceEncounterId, TEMPLATE_CHIEF_COMPLAINT),
      getLatestClinicalNote(supabase, sourceEncounterId, TEMPLATE_ANAMNESIS_ENCOUNTER),
      getLatestClinicalNote(supabase, sourceEncounterId, TEMPLATE_PHYSICAL_EXAM),
      getLatestClinicalNote(supabase, sourceEncounterId, DEFAULT_NOTE_TEMPLATE),
      listExamRequestsForEncounter(supabase, sourceEncounterId).catch(() => []),
      listOrientationsForEncounter(supabase, sourceEncounterId).catch(() => []),
      listPrescriptionsForPatient(supabase, encounter.patientId).catch(() => []),
    ]);

  const rxForEncounter = prescriptions.filter((item) => item.encounterId === sourceEncounterId);

  return {
    encounter,
    chiefComplaint: complaintNote ? parseChiefComplaint(complaintNote.body) : null,
    anamnesis: anamnesisNote ? parseAnamnesis(anamnesisNote.body) : null,
    physicalExam: examNote ? parsePhysicalExam(examNote.body) : null,
    soap: soapNote ? soapFromBody(soapNote.body) : null,
    prescriptionsCount: rxForEncounter.length,
    examRequestsCount: examRequests.length,
    orientationsCount: orientations.length,
  };
}

export async function findOpenReturnForSource(
  supabase: SupabaseClient,
  sourceEncounterId: string,
  professionalId: string,
): Promise<EncounterRow | null> {
  const returns = await listReturnsOfEncounter(supabase, sourceEncounterId);
  return (
    returns.find(
      (item) => item.status === "open" && item.professionalId === professionalId,
    ) ?? null
  );
}
