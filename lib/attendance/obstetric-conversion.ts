/**
 * C070-C2 — conversão gin→obs no mesmo appointment/encounter/paciente.
 * Sem migration: trilha explícita em pregnancy.notes (marcador C070_CONV).
 * audit_events via encounter_audit_event exigiria novo evento no allowlist (migration).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createPregnancy,
  emptyPregnancyForm,
  listPatientPregnancies,
  type PregnancyRow,
} from "@/lib/pregnancies/directory";
import {
  getPatient,
  patientDetailToForm,
  updatePatient,
} from "@/lib/patients/directory";
import { linkEncounterToPregnancy } from "@/lib/attendance/directory";

export const CONV_MARKER = "C070_CONV";

export type ConversionPregnancyChoice = {
  id: string;
  dum: string;
  dpp: string;
  status: string;
  risk: string;
  primaryName: string;
  createdAt: string;
  inCare: boolean;
};

export function buildConversionNote(input: {
  encounterId: string;
  atIso: string;
}): string {
  return `[${CONV_MARKER}] encounter=${input.encounterId} from=ginecologia to=obstetricia at=${input.atIso}`;
}

export function notesHasConversionForEncounter(
  notes: string | null | undefined,
  encounterId: string,
): boolean {
  if (!notes) return false;
  return notes.includes(`[${CONV_MARKER}]`) && notes.includes(`encounter=${encounterId}`);
}

export function formatChoiceDate(value: string | null | undefined): string {
  if (!value) return "—";
  const iso = value.slice(0, 10);
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function toConversionChoices(
  rows: PregnancyRow[],
  practiceId: string,
): ConversionPregnancyChoice[] {
  return rows
    .filter((row) => row.practiceId === practiceId)
    .sort((left, right) => {
      if (left.status === "in_care" && right.status !== "in_care") return -1;
      if (right.status === "in_care" && left.status !== "in_care") return 1;
      return right.createdAt.localeCompare(left.createdAt);
    })
    .map((row) => ({
      id: row.id,
      dum: formatChoiceDate(row.lmpDate),
      dpp: formatChoiceDate(row.clinicalEdd ?? row.calculatedEdd),
      status: row.status,
      risk: row.risk ?? "—",
      primaryName: row.primaryName ?? "—",
      createdAt: formatChoiceDate(row.createdAt),
      inCare: row.status === "in_care",
    }));
}

async function appendConversionNote(
  supabase: SupabaseClient | null,
  pregnancyId: string,
  encounterId: string,
  patientId: string,
): Promise<void> {
  if (!supabase) {
    const rows = await listPatientPregnancies(null, patientId);
    const row = rows.find((item) => item.id === pregnancyId);
    if (!row || notesHasConversionForEncounter(row.notes, encounterId)) return;
    const line = buildConversionNote({ encounterId, atIso: new Date().toISOString() });
    const next = row.notes?.trim() ? `${row.notes.trim()}\n${line}` : line;
    const { updatePregnancy } = await import("@/lib/pregnancies/directory");
    await updatePregnancy(
      null,
      pregnancyId,
      emptyPregnancyForm({
        practiceId: row.practiceId,
        primaryProfessionalId: row.primaryProfessionalId,
        backupProfessionalId: row.backupProfessionalId ?? "",
        lmpDate: row.lmpDate ?? "",
        clinicalEdd: row.clinicalEdd ?? "",
        pregnancyNumber: row.pregnancyNumber != null ? String(row.pregnancyNumber) : "",
        risk: row.risk ?? "",
        careStartedOn: row.careStartedOn ?? "",
        notes: next,
        changeReason: "Conversão de atendimento ginecológico para obstétrico",
      }),
      { patientId: row.patientId, organizationId: row.organizationId },
    );
    return;
  }
  const { data } = await supabase
    .from("pregnancies")
    .select("notes")
    .eq("id", pregnancyId)
    .maybeSingle();
  const current = typeof data?.notes === "string" ? data.notes : "";
  if (notesHasConversionForEncounter(current, encounterId)) return;
  const line = buildConversionNote({
    encounterId,
    atIso: new Date().toISOString(),
  });
  const next = current.trim() ? `${current.trim()}\n${line}` : line;
  await supabase
    .from("pregnancies")
    .update({
      notes: next,
      last_change_reason: "Conversão de atendimento ginecológico para obstétrico",
    })
    .eq("id", pregnancyId);
}

async function ensureObstetricsSpecialty(
  supabase: SupabaseClient | null,
  patientId: string,
): Promise<{ previous: string[]; error: string | null }> {
  const patient = await getPatient(supabase, patientId);
  if (!patient) return { previous: [], error: "Paciente não encontrada." };
  const previous = [...patient.careSpecialties];
  if (patient.careSpecialties.includes("obstetrics")) {
    return { previous, error: null };
  }
  const form = patientDetailToForm(patient);
  form.careSpecialties = [...form.careSpecialties, "obstetrics"];
  try {
    await updatePatient(supabase, patient.id, form);
    return { previous, error: null };
  } catch (err) {
    return {
      previous,
      error: err instanceof Error ? err.message : "Não foi possível atualizar a especialidade.",
    };
  }
}

export type ConvertResult = {
  ok: boolean;
  error: string | null;
  notice: string | null;
  pregnancyId: string | null;
  /** UI deve abrir seletor */
  needPick: boolean;
  /** UI deve abrir criação */
  needCreate: boolean;
  choices: ConversionPregnancyChoice[];
};

/**
 * Passo pós-confirmação: classifica cenário e, se possível, conclui vínculo.
 * Ordem segura: vincular gestação antes de (ou junto com) especialidade quando já existe;
 * na criação, gestação → link → especialidade.
 */
export async function resolveObstetricConversion(
  supabase: SupabaseClient | null,
  input: {
    encounterId: string;
    patientId: string;
    practiceId: string;
    alreadyLinked: boolean;
  },
): Promise<ConvertResult> {
  if (input.alreadyLinked) {
    return {
      ok: true,
      error: null,
      notice: "Este atendimento já está no contexto obstétrico.",
      pregnancyId: null,
      needPick: false,
      needCreate: false,
      choices: [],
    };
  }

  const rows = await listPatientPregnancies(supabase, input.patientId);
  const choices = toConversionChoices(rows, input.practiceId);
  const inCare = choices.filter((c) => c.inCare);

  if (inCare.length === 1) {
    return finishLink(supabase, {
      encounterId: input.encounterId,
      patientId: input.patientId,
      pregnancyId: inCare[0].id,
      successNotice: "Atendimento alterado para obstétrico e vinculado à gestação atual.",
    });
  }

  if (inCare.length > 1) {
    return {
      ok: false,
      error: null,
      notice: "Selecione a gestação deste atendimento.",
      pregnancyId: null,
      needPick: true,
      needCreate: false,
      choices: inCare,
    };
  }

  if (choices.length > 0) {
    return {
      ok: false,
      error: null,
      notice: "Nenhuma gestação em acompanhamento. Selecione uma gestação ou crie um novo acompanhamento.",
      pregnancyId: null,
      needPick: true,
      needCreate: true,
      choices,
    };
  }

  return {
    ok: false,
    error: null,
    notice: "Não há gestação cadastrada. Crie o acompanhamento obstétrico para continuar.",
    pregnancyId: null,
    needPick: false,
    needCreate: true,
    choices: [],
  };
}

async function finishLink(
  supabase: SupabaseClient | null,
  input: {
    encounterId: string;
    patientId: string;
    pregnancyId: string;
    successNotice: string;
  },
): Promise<ConvertResult> {
  const link = await linkEncounterToPregnancy(
    supabase,
    input.encounterId,
    input.pregnancyId,
  );
  if (link.error || !link.encounterId) {
    return {
      ok: false,
      error: link.error ?? "Não foi possível vincular a gestação.",
      notice: null,
      pregnancyId: null,
      needPick: false,
      needCreate: false,
      choices: [],
    };
  }

  await appendConversionNote(supabase, input.pregnancyId, input.encounterId, input.patientId);
  const specialty = await ensureObstetricsSpecialty(supabase, input.patientId);
  if (specialty.error) {
    return {
      ok: false,
      error: `Gestação vinculada, mas a especialidade não foi atualizada: ${specialty.error}`,
      notice: null,
      pregnancyId: input.pregnancyId,
      needPick: false,
      needCreate: false,
      choices: [],
    };
  }

  return {
    ok: true,
    error: null,
    notice: input.successNotice,
    pregnancyId: input.pregnancyId,
    needPick: false,
    needCreate: false,
    choices: [],
  };
}

export async function linkChosenPregnancyForConversion(
  supabase: SupabaseClient | null,
  input: {
    encounterId: string;
    patientId: string;
    pregnancyId: string;
  },
): Promise<ConvertResult> {
  return finishLink(supabase, {
    ...input,
    successNotice: "Atendimento alterado para obstétrico e gestação vinculada.",
  });
}

export async function createPregnancyAndConvert(
  supabase: SupabaseClient | null,
  input: {
    encounterId: string;
    patientId: string;
    organizationId: string;
    practiceId: string;
    primaryProfessionalId: string;
    lmpDate: string;
    clinicalEdd: string;
    careStartedOn: string;
  },
): Promise<ConvertResult> {
  const form = emptyPregnancyForm({
    practiceId: input.practiceId,
    primaryProfessionalId: input.primaryProfessionalId,
    lmpDate: input.lmpDate,
    clinicalEdd: input.clinicalEdd,
    careStartedOn: input.careStartedOn || undefined,
    changeReason: "Conversão de atendimento ginecológico para obstétrico",
    notes: buildConversionNote({
      encounterId: input.encounterId,
      atIso: new Date().toISOString(),
    }),
  });

  let pregnancy: PregnancyRow;
  try {
    pregnancy = await createPregnancy(supabase, form, {
      patientId: input.patientId,
      organizationId: input.organizationId,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Não foi possível criar a gestação.",
      notice: null,
      pregnancyId: null,
      needPick: false,
      needCreate: true,
      choices: [],
    };
  }

  return finishLink(supabase, {
    encounterId: input.encounterId,
    patientId: input.patientId,
    pregnancyId: pregnancy.id,
    successNotice:
      "Acompanhamento obstétrico criado, vinculado a este atendimento. O agendamento original foi preservado.",
  });
}
