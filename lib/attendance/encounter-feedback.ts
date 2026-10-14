import type { SupabaseClient } from "@supabase/supabase-js";

export type EncounterPatientFeedback = {
  id: string;
  encounterId: string;
  patientId: string;
  practiceId: string;
  satisfactionScore: number | null;
  experienceComment: string | null;
  source: "portal" | "clinical" | "staff";
  createdAt: string;
  updatedAt: string;
};

export type PortalFeedbackTarget = {
  encounterId: string;
  practiceId: string;
  signedAt: string | null;
  createdAt: string;
  hasFeedback: boolean;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function mapError(error: { message?: string } | null): string {
  const message = error?.message ?? "";
  if (message.includes("FORBIDDEN")) return "Sem permissão para este feedback.";
  if (message.includes("ENCOUNTER_NOT_SIGNED")) return "Feedback disponível após assinatura do atendimento.";
  if (message.includes("FEEDBACK_EMPTY")) return "Informe nota ou comentário.";
  if (message.includes("NOT_AUTHENTICATED")) return "Sessão expirada.";
  return message || "Não foi possível registrar o feedback.";
}

function toFeedback(raw: Record<string, unknown>): EncounterPatientFeedback | null {
  const id = asString(raw.id);
  const encounterId = asString(raw.encounter_id);
  const patientId = asString(raw.patient_id);
  const practiceId = asString(raw.practice_id);
  const source = asString(raw.source) as EncounterPatientFeedback["source"] | null;
  const createdAt = asString(raw.created_at);
  const updatedAt = asString(raw.updated_at);
  if (!id || !encounterId || !patientId || !practiceId || !source || !createdAt || !updatedAt) {
    return null;
  }
  return {
    id,
    encounterId,
    patientId,
    practiceId,
    satisfactionScore: typeof raw.satisfaction_score === "number" ? raw.satisfaction_score : null,
    experienceComment: asString(raw.experience_comment),
    source,
    createdAt,
    updatedAt,
  };
}

export async function getEncounterPatientFeedback(
  supabase: SupabaseClient,
  encounterId: string,
): Promise<{ feedback: EncounterPatientFeedback | null; error: string | null }> {
  const { data, error } = await supabase.rpc("encounter_patient_feedback_get", {
    p_encounter_id: encounterId,
  });
  if (error) {
    if (/ENCOUNTER_NOT_FOUND|FORBIDDEN/i.test(error.message)) {
      return { feedback: null, error: mapError(error) };
    }
    // null row when no feedback yet
    if (/null|0 rows/i.test(error.message)) {
      return { feedback: null, error: null };
    }
    return { feedback: null, error: mapError(error) };
  }
  if (!data) return { feedback: null, error: null };
  return { feedback: toFeedback(data as Record<string, unknown>), error: null };
}

export async function upsertEncounterPatientFeedback(
  supabase: SupabaseClient,
  input: {
    encounterId: string;
    satisfactionScore?: number | null;
    experienceComment?: string;
    source?: "portal" | "clinical" | "staff";
  },
): Promise<{ feedback: EncounterPatientFeedback | null; error: string | null }> {
  const { data, error } = await supabase.rpc("encounter_patient_feedback_upsert", {
    p_encounter_id: input.encounterId,
    p_satisfaction_score: input.satisfactionScore ?? null,
    p_experience_comment: input.experienceComment ?? null,
    p_source: input.source ?? "portal",
  });
  if (error || !data) return { feedback: null, error: mapError(error) };
  return { feedback: toFeedback(data as Record<string, unknown>), error: null };
}

export async function listPortalFeedbackTargets(
  supabase: SupabaseClient,
): Promise<{ targets: PortalFeedbackTarget[]; error: string | null }> {
  const { data, error } = await supabase.rpc("patient_portal_feedback_targets");
  if (error) return { targets: [], error: mapError(error) };
  const list = Array.isArray(data) ? data : [];
  const targets = list.flatMap((item) => {
    const row = item as Record<string, unknown>;
    const encounterId = asString(row.encounter_id);
    const practiceId = asString(row.practice_id);
    const createdAt = asString(row.created_at);
    if (!encounterId || !practiceId || !createdAt) return [];
    return [
      {
        encounterId,
        practiceId,
        signedAt: asString(row.signed_at),
        createdAt,
        hasFeedback: Boolean(row.has_feedback),
      },
    ];
  });
  return { targets, error: null };
}

export async function markEncounterAuditEvent(
  supabase: SupabaseClient,
  encounterId: string,
  event:
    | "encounter_review_started"
    | "encounter_review_completed"
    | "encounter_closed"
    | "clinical_document_finalized"
    | "patient_feedback_viewed",
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("encounter_audit_event", {
    p_encounter_id: encounterId,
    p_event: event,
  });
  return { error: error ? mapError(error) : null };
}
