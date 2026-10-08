/** Carrega anamnese de encounters anteriores da mesma prática — C040.2. */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listEncountersForPatient,
  toClinicalNoteRow,
  type ClinicalNoteRow,
  type EncounterRow,
} from "@/lib/attendance/directory";
import {
  TEMPLATE_ANAMNESIS_ENCOUNTER,
  parseAnamnesis,
  type AnamnesisEncounterForm,
} from "@/lib/attendance/clinical-forms";

export type PriorAnamnesisRef = {
  encounter: EncounterRow;
  note: ClinicalNoteRow;
  form: AnamnesisEncounterForm;
};

/** Uma consulta agregada de notas + mapa de encounters — evita N+1. */
export async function loadPriorAnamnesis(
  supabase: SupabaseClient,
  input: {
    practiceId: string;
    patientId: string;
    currentEncounterId: string;
  },
): Promise<PriorAnamnesisRef | null> {
  const encounters = await listEncountersForPatient(
    supabase,
    input.practiceId,
    input.patientId,
  );
  const others = encounters.filter((item) => item.id !== input.currentEncounterId);
  if (!others.length) return null;

  const encounterIds = others.map((item) => item.id);
  const { data, error } = await supabase
    .from("clinical_notes")
    .select(
      "id, encounter_id, organization_id, practice_id, body_ciphertext, template_code, version, created_by, created_at",
    )
    .in("encounter_id", encounterIds)
    .eq("template_code", TEMPLATE_ANAMNESIS_ENCOUNTER)
    .eq("practice_id", input.practiceId);

  if (error || !data?.length) return null;

  const byEncounter = new Map<string, ClinicalNoteRow>();
  for (const raw of data) {
    const note = toClinicalNoteRow(raw as Record<string, unknown>);
    if (!note?.body?.trim()) continue;
    const existing = byEncounter.get(note.encounterId);
    if (!existing || note.version > existing.version) {
      byEncounter.set(note.encounterId, note);
    }
  }

  for (const encounter of others) {
    const note = byEncounter.get(encounter.id);
    if (!note) continue;
    return {
      encounter,
      note,
      form: parseAnamnesis(note.body),
    };
  }
  return null;
}
