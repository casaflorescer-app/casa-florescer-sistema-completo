/** Cadastro clínico histórico (patient_clinical_data) — C040.2. */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isCasaBrowserAuth } from "@/lib/auth/casa-mode";
import { readPatientClinicalCasa } from "@/lib/casa/reads";

export type PatientClinicalCadastro = {
  patientId: string;
  organizationId: string;
  allergies: string | null;
  continuousMedications: string | null;
  comorbidities: string | null;
  pregnancies: number;
  births: number;
  abortions: number;
  lmpDate: string | null;
  edd: string | null;
  gynProcedures: string[];
  updatedAt: string | null;
  updatedBy: string | null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function toPatientClinicalCadastro(
  value: Record<string, unknown>,
): PatientClinicalCadastro | null {
  const patientId = typeof value.patient_id === "string" ? value.patient_id : null;
  const organizationId =
    typeof value.organization_id === "string" ? value.organization_id : null;
  if (!patientId || !organizationId) return null;
  return {
    patientId,
    organizationId,
    allergies: asString(value.allergies),
    continuousMedications: asString(value.continuous_medications),
    comorbidities: asString(value.comorbidities),
    pregnancies: asNumber(value.pregnancies),
    births: asNumber(value.births),
    abortions: asNumber(value.abortions),
    lmpDate: asString(value.lmp_date),
    edd: asString(value.edd),
    gynProcedures: Array.isArray(value.gyn_procedures)
      ? value.gyn_procedures.filter((item): item is string => typeof item === "string")
      : [],
    updatedAt: asString(value.updated_at),
    updatedBy: asString(value.updated_by),
  };
}

export async function getPatientClinicalCadastro(
  supabase: SupabaseClient | null,
  patientId: string,
  practiceId?: string,
): Promise<PatientClinicalCadastro | null> {
  if (!supabase) {
    if (!isCasaBrowserAuth() || !practiceId) return null;
    const raw = await readPatientClinicalCasa(patientId, practiceId);
    return raw ? toPatientClinicalCadastro(raw) : null;
  }
  const { data, error } = await supabase
    .from("patient_clinical_data")
    .select(
      "patient_id, organization_id, allergies, continuous_medications, comorbidities, pregnancies, births, abortions, lmp_date, edd, gyn_procedures, updated_at, updated_by",
    )
    .eq("patient_id", patientId)
    .maybeSingle();
  if (error || !data) return null;
  return toPatientClinicalCadastro(data as Record<string, unknown>);
}

/** Atualiza campos de segurança/antecedentes do cadastro (não é anamnese do encounter). */
export async function upsertPatientClinicalCadastro(
  supabase: SupabaseClient | null,
  input: {
    patientId: string;
    organizationId: string;
    practiceId?: string;
    allergies: string | null;
    continuousMedications: string | null;
    comorbidities: string | null;
    updatedBy: string;
  },
): Promise<{ ok: boolean; error: string | null }> {
  if (!supabase) {
    if (!isCasaBrowserAuth()) return { ok: false, error: "Autenticação não configurada neste ambiente." };
    if (!input.practiceId) return { ok: false, error: "A ficha desta prática não foi informada." };
    const response = await fetch("/api/casa/clinical", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        patientId: input.patientId,
        organizationId: input.organizationId,
        practiceId: input.practiceId,
        allergies: input.allergies,
        continuousMedications: input.continuousMedications,
        comorbidities: input.comorbidities,
      }),
    });
    if (response.status === 401) return { ok: false, error: "Sem sessão." };
    if (response.status === 403) {
      return { ok: false, error: "O prontuário clínico está disponível apenas para médicas autorizadas." };
    }
    if (!response.ok) return { ok: false, error: "Não foi possível atualizar a ficha." };
    return { ok: true, error: null };
  }
  const existing = await getPatientClinicalCadastro(supabase, input.patientId);
  if (existing) {
    const { error } = await supabase
      .from("patient_clinical_data")
      .update({
        allergies: input.allergies,
        continuous_medications: input.continuousMedications,
        comorbidities: input.comorbidities,
        updated_by: input.updatedBy,
        updated_at: new Date().toISOString(),
      })
      .eq("patient_id", input.patientId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, error: null };
  }

  const { error } = await supabase.from("patient_clinical_data").insert({
    patient_id: input.patientId,
    organization_id: input.organizationId,
    allergies: input.allergies,
    continuous_medications: input.continuousMedications,
    comorbidities: input.comorbidities,
    updated_by: input.updatedBy,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}
