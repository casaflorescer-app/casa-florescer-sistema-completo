/**
 * Contratos JSON C040.2 — queixa, anamnese do encounter e exame físico.
 *
 * Persistência (clinical_note_upsert):
 * - 1 linha por (encounter_id, template_code).
 * - Autosave/salvar no encounter open: sobrescreve body_ciphertext e faz version++.
 * - `version` é contador de revisões do RASCUNHO atual — NÃO recupera conteúdo anterior.
 * - write_audit registra metadata (encounter, template, version), sem o texto clínico.
 * - Histórico clínico recuperável = notas de encounters distintos (ex.: anamnese anterior).
 * - Após encounter_sign / status <> open: escrita bloqueada (RPC + trigger).
 */

export const TEMPLATE_CHIEF_COMPLAINT = "chief_complaint" as const;
export const TEMPLATE_ANAMNESIS_ENCOUNTER = "anamnesis_encounter" as const;
export const TEMPLATE_PHYSICAL_EXAM = "physical_exam" as const;

export const VISIT_MOTIVES = [
  "routine",
  "return",
  "follow_up",
  "exam_review",
  "specific_complaint",
  "procedure",
  "other",
] as const;

export type VisitMotive = (typeof VISIT_MOTIVES)[number];

export const VISIT_MOTIVE_LABEL: Record<VisitMotive, string> = {
  routine: "Consulta de rotina",
  return: "Retorno",
  follow_up: "Acompanhamento",
  exam_review: "Avaliação de exame",
  specific_complaint: "Queixa específica",
  procedure: "Procedimento",
  other: "Outro",
};

export type ChiefComplaintForm = {
  chiefComplaint: string;
  motives: VisitMotive[];
  otherMotive: string;
  historyOfPresentIllness: string;
};

export const EMPTY_CHIEF_COMPLAINT: ChiefComplaintForm = {
  chiefComplaint: "",
  motives: [],
  otherMotive: "",
  historyOfPresentIllness: "",
};

export type AnamnesisEncounterForm = {
  personalHistoryNotes: string;
  familyHistoryNotes: string;
  habitsNotes: string;
  surgicalHistoryNotes: string;
  gynecologicNotes: string;
  obstetricNotes: string;
  changesSinceLastVisit: string;
  reviewNotes: string;
  /** Snapshot de referência do cadastro no momento do atendimento (somente leitura no form). */
  reviewedAllergies: string;
  reviewedMedications: string;
  reviewedComorbidities: string;
  noRelevantChanges: boolean;
};

export const EMPTY_ANAMNESIS: AnamnesisEncounterForm = {
  personalHistoryNotes: "",
  familyHistoryNotes: "",
  habitsNotes: "",
  surgicalHistoryNotes: "",
  gynecologicNotes: "",
  obstetricNotes: "",
  changesSinceLastVisit: "",
  reviewNotes: "",
  reviewedAllergies: "",
  reviewedMedications: "",
  reviewedComorbidities: "",
  noRelevantChanges: false,
};

export type VitalSignsForm = {
  systolicBp: string;
  diastolicBp: string;
  heartRate: string;
  respiratoryRate: string;
  temperatureC: string;
  spo2: string;
  weightKg: string;
  heightCm: string;
};

export const EMPTY_VITALS: VitalSignsForm = {
  systolicBp: "",
  diastolicBp: "",
  heartRate: "",
  respiratoryRate: "",
  temperatureC: "",
  spo2: "",
  weightKg: "",
  heightCm: "",
};

export type PhysicalExamForm = {
  vitals: VitalSignsForm;
  general: string;
  cardiovascular: string;
  respiratory: string;
  abdominal: string;
  gynecologic: string;
  obstetric: string;
  otherSystems: string;
  freeText: string;
  noRelevantFindings: boolean;
};

export const EMPTY_PHYSICAL_EXAM: PhysicalExamForm = {
  vitals: { ...EMPTY_VITALS },
  general: "",
  cardiovascular: "",
  respiratory: "",
  abdominal: "",
  gynecologic: "",
  obstetric: "",
  otherSystems: "",
  freeText: "",
  noRelevantFindings: false,
};

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asBool(value: unknown): boolean {
  return value === true;
}

function asMotives(value: unknown): VisitMotive[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is VisitMotive =>
    (VISIT_MOTIVES as readonly string[]).includes(String(item)),
  );
}

export function parseChiefComplaint(body: string | null | undefined): ChiefComplaintForm {
  if (!body?.trim()) return { ...EMPTY_CHIEF_COMPLAINT };
  try {
    const parsed = JSON.parse(body) as Partial<ChiefComplaintForm>;
    if (!parsed || typeof parsed !== "object") {
      return { ...EMPTY_CHIEF_COMPLAINT, chiefComplaint: body };
    }
    return {
      chiefComplaint: asString(parsed.chiefComplaint),
      motives: asMotives(parsed.motives),
      otherMotive: asString(parsed.otherMotive),
      historyOfPresentIllness: asString(parsed.historyOfPresentIllness),
    };
  } catch {
    return { ...EMPTY_CHIEF_COMPLAINT, chiefComplaint: body };
  }
}

export function serializeChiefComplaint(form: ChiefComplaintForm): string {
  return JSON.stringify({
    chiefComplaint: form.chiefComplaint.trim(),
    motives: form.motives,
    otherMotive: form.otherMotive.trim(),
    historyOfPresentIllness: form.historyOfPresentIllness.trim(),
  });
}

export function chiefComplaintHasContent(form: ChiefComplaintForm): boolean {
  return Boolean(
    form.chiefComplaint.trim() ||
      form.motives.length ||
      form.otherMotive.trim() ||
      form.historyOfPresentIllness.trim(),
  );
}

export function parseAnamnesis(body: string | null | undefined): AnamnesisEncounterForm {
  if (!body?.trim()) return { ...EMPTY_ANAMNESIS };
  try {
    const parsed = JSON.parse(body) as Partial<AnamnesisEncounterForm>;
    if (!parsed || typeof parsed !== "object") {
      return { ...EMPTY_ANAMNESIS, reviewNotes: body };
    }
    return {
      personalHistoryNotes: asString(parsed.personalHistoryNotes),
      familyHistoryNotes: asString(parsed.familyHistoryNotes),
      habitsNotes: asString(parsed.habitsNotes),
      surgicalHistoryNotes: asString(parsed.surgicalHistoryNotes),
      gynecologicNotes: asString(parsed.gynecologicNotes),
      obstetricNotes: asString(parsed.obstetricNotes),
      changesSinceLastVisit: asString(parsed.changesSinceLastVisit),
      reviewNotes: asString(parsed.reviewNotes),
      reviewedAllergies: asString(parsed.reviewedAllergies),
      reviewedMedications: asString(parsed.reviewedMedications),
      reviewedComorbidities: asString(parsed.reviewedComorbidities),
      noRelevantChanges: asBool(parsed.noRelevantChanges),
    };
  } catch {
    return { ...EMPTY_ANAMNESIS, reviewNotes: body };
  }
}

export function serializeAnamnesis(form: AnamnesisEncounterForm): string {
  return JSON.stringify({
    personalHistoryNotes: form.personalHistoryNotes.trim(),
    familyHistoryNotes: form.familyHistoryNotes.trim(),
    habitsNotes: form.habitsNotes.trim(),
    surgicalHistoryNotes: form.surgicalHistoryNotes.trim(),
    gynecologicNotes: form.gynecologicNotes.trim(),
    obstetricNotes: form.obstetricNotes.trim(),
    changesSinceLastVisit: form.changesSinceLastVisit.trim(),
    reviewNotes: form.reviewNotes.trim(),
    reviewedAllergies: form.reviewedAllergies.trim(),
    reviewedMedications: form.reviewedMedications.trim(),
    reviewedComorbidities: form.reviewedComorbidities.trim(),
    noRelevantChanges: form.noRelevantChanges,
  });
}

export function anamnesisHasContent(form: AnamnesisEncounterForm): boolean {
  return Boolean(
    form.personalHistoryNotes.trim() ||
      form.familyHistoryNotes.trim() ||
      form.habitsNotes.trim() ||
      form.surgicalHistoryNotes.trim() ||
      form.gynecologicNotes.trim() ||
      form.obstetricNotes.trim() ||
      form.changesSinceLastVisit.trim() ||
      form.reviewNotes.trim() ||
      form.reviewedAllergies.trim() ||
      form.reviewedMedications.trim() ||
      form.reviewedComorbidities.trim() ||
      form.noRelevantChanges,
  );
}

export function parsePhysicalExam(body: string | null | undefined): PhysicalExamForm {
  if (!body?.trim()) return { ...EMPTY_PHYSICAL_EXAM, vitals: { ...EMPTY_VITALS } };
  try {
    const parsed = JSON.parse(body) as Partial<PhysicalExamForm> & {
      vitals?: Partial<VitalSignsForm>;
    };
    if (!parsed || typeof parsed !== "object") {
      return { ...EMPTY_PHYSICAL_EXAM, vitals: { ...EMPTY_VITALS }, freeText: body };
    }
    const vitals: Partial<VitalSignsForm> =
      parsed.vitals && typeof parsed.vitals === "object" ? parsed.vitals : {};
    return {
      vitals: {
        systolicBp: asString(vitals.systolicBp),
        diastolicBp: asString(vitals.diastolicBp),
        heartRate: asString(vitals.heartRate),
        respiratoryRate: asString(vitals.respiratoryRate),
        temperatureC: asString(vitals.temperatureC),
        spo2: asString(vitals.spo2),
        weightKg: asString(vitals.weightKg),
        heightCm: asString(vitals.heightCm),
      },
      general: asString(parsed.general),
      cardiovascular: asString(parsed.cardiovascular),
      respiratory: asString(parsed.respiratory),
      abdominal: asString(parsed.abdominal),
      gynecologic: asString(parsed.gynecologic),
      obstetric: asString(parsed.obstetric),
      otherSystems: asString(parsed.otherSystems),
      freeText: asString(parsed.freeText),
      noRelevantFindings: asBool(parsed.noRelevantFindings),
    };
  } catch {
    return { ...EMPTY_PHYSICAL_EXAM, vitals: { ...EMPTY_VITALS }, freeText: body };
  }
}

export function serializePhysicalExam(form: PhysicalExamForm): string {
  return JSON.stringify({
    vitals: {
      systolicBp: form.vitals.systolicBp.trim(),
      diastolicBp: form.vitals.diastolicBp.trim(),
      heartRate: form.vitals.heartRate.trim(),
      respiratoryRate: form.vitals.respiratoryRate.trim(),
      temperatureC: form.vitals.temperatureC.trim(),
      spo2: form.vitals.spo2.trim(),
      weightKg: form.vitals.weightKg.trim(),
      heightCm: form.vitals.heightCm.trim(),
    },
    general: form.general.trim(),
    cardiovascular: form.cardiovascular.trim(),
    respiratory: form.respiratory.trim(),
    abdominal: form.abdominal.trim(),
    gynecologic: form.gynecologic.trim(),
    obstetric: form.obstetric.trim(),
    otherSystems: form.otherSystems.trim(),
    freeText: form.freeText.trim(),
    noRelevantFindings: form.noRelevantFindings,
  });
}

export function physicalExamHasContent(form: PhysicalExamForm): boolean {
  const v = form.vitals;
  return Boolean(
    v.systolicBp.trim() ||
      v.diastolicBp.trim() ||
      v.heartRate.trim() ||
      v.respiratoryRate.trim() ||
      v.temperatureC.trim() ||
      v.spo2.trim() ||
      v.weightKg.trim() ||
      v.heightCm.trim() ||
      form.general.trim() ||
      form.cardiovascular.trim() ||
      form.respiratory.trim() ||
      form.abdominal.trim() ||
      form.gynecologic.trim() ||
      form.obstetric.trim() ||
      form.otherSystems.trim() ||
      form.freeText.trim() ||
      form.noRelevantFindings,
  );
}

export function computeBmi(weightKg: string, heightCm: string): number | null {
  const w = Number(String(weightKg).replace(",", "."));
  const hCm = Number(String(heightCm).replace(",", "."));
  if (!Number.isFinite(w) || !Number.isFinite(hCm) || w <= 0 || hCm <= 0) return null;
  const h = hCm / 100;
  if (h <= 0) return null;
  const bmi = w / (h * h);
  return Number.isFinite(bmi) ? Math.round(bmi * 10) / 10 : null;
}

export type VitalAlert = { field: string; message: string };

/** Alertas de faixa — não constituem diagnóstico. */
export function validateVitals(vitals: VitalSignsForm): VitalAlert[] {
  const alerts: VitalAlert[] = [];
  const num = (raw: string) => {
    if (!raw.trim()) return null;
    const n = Number(raw.replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  };

  const sys = num(vitals.systolicBp);
  const dia = num(vitals.diastolicBp);
  const hr = num(vitals.heartRate);
  const rr = num(vitals.respiratoryRate);
  const temp = num(vitals.temperatureC);
  const spo2 = num(vitals.spo2);
  const weight = num(vitals.weightKg);
  const height = num(vitals.heightCm);

  if (sys !== null && (Number.isNaN(sys) || sys < 60 || sys > 260)) {
    alerts.push({ field: "systolicBp", message: "PA sistólica fora da faixa esperada (60–260)." });
  }
  if (dia !== null && (Number.isNaN(dia) || dia < 30 || dia > 160)) {
    alerts.push({ field: "diastolicBp", message: "PA diastólica fora da faixa esperada (30–160)." });
  }
  if (sys !== null && dia !== null && !Number.isNaN(sys) && !Number.isNaN(dia) && sys < dia) {
    alerts.push({ field: "systolicBp", message: "PA sistólica menor que a diastólica." });
  }
  if (hr !== null && (Number.isNaN(hr) || hr < 20 || hr > 250)) {
    alerts.push({ field: "heartRate", message: "Frequência cardíaca fora da faixa esperada (20–250)." });
  }
  if (rr !== null && (Number.isNaN(rr) || rr < 5 || rr > 80)) {
    alerts.push({
      field: "respiratoryRate",
      message: "Frequência respiratória fora da faixa esperada (5–80).",
    });
  }
  if (temp !== null && (Number.isNaN(temp) || temp < 30 || temp > 45)) {
    alerts.push({ field: "temperatureC", message: "Temperatura fora da faixa esperada (30–45 °C)." });
  }
  if (spo2 !== null && (Number.isNaN(spo2) || spo2 < 50 || spo2 > 100)) {
    alerts.push({ field: "spo2", message: "Saturação fora da faixa esperada (50–100%)." });
  }
  if (weight !== null && (Number.isNaN(weight) || weight < 1 || weight > 400)) {
    alerts.push({ field: "weightKg", message: "Peso fora da faixa esperada (1–400 kg)." });
  }
  if (height !== null && (Number.isNaN(height) || height < 30 || height > 250)) {
    alerts.push({ field: "heightCm", message: "Altura fora da faixa esperada (30–250 cm)." });
  }
  return alerts;
}

export function sameChiefComplaint(a: ChiefComplaintForm, b: ChiefComplaintForm): boolean {
  return serializeChiefComplaint(a) === serializeChiefComplaint(b);
}

export function sameAnamnesis(a: AnamnesisEncounterForm, b: AnamnesisEncounterForm): boolean {
  return serializeAnamnesis(a) === serializeAnamnesis(b);
}

export function samePhysicalExam(a: PhysicalExamForm, b: PhysicalExamForm): boolean {
  return serializePhysicalExam(a) === serializePhysicalExam(b);
}
