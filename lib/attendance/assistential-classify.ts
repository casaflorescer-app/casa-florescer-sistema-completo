import type { AppointmentKind } from "@/lib/types/database";
import type { CareSpecialty } from "@/lib/patients/directory";

/** Buckets de apresentação do Painel (C041) — mapeados a partir de dados oficiais. */
export type AssistentialBucket = "gynecology" | "obstetrics" | "procedure";

export const ASSISTENTIAL_BUCKET_LABEL: Record<AssistentialBucket, string> = {
  gynecology: "Ginecológico",
  obstetrics: "Obstétrico",
  procedure: "Procedimento",
};

/**
 * Classifica atendimento do dia sem inventar taxonomia.
 * - appointments.kind = procedure → Procedimento
 * - care_specialties do paciente (gynecology / obstetrics) → consulta
 * - consulta sem especialidade → Ginecológico (padrão Casa Florescer)
 */
export function classifyAppointmentAssistential(
  kind: AppointmentKind,
  careSpecialties: CareSpecialty[],
): AssistentialBucket {
  if (kind === "procedure") return "procedure";
  const hasObs = careSpecialties.includes("obstetrics");
  const hasGyn = careSpecialties.includes("gynecology");
  if (hasObs && !hasGyn) return "obstetrics";
  // gynecology only, both, or vazio → ginecológico (padrão consultório CF)
  return "gynecology";
}
