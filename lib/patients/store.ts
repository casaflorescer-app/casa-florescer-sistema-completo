import { isStaticHosting } from "@/lib/hosting";
import { createClient } from "@/lib/supabase/client";
import type { PatientCadastroValues } from "./schema";
import { eddFromLmp, onlyDigits } from "./format";

export type StoredPatient = PatientCadastroValues & {
  id: string;
  createdAt: string;
  updatedAt: string;
  edd: string;
};

const STORAGE_KEY = "florescer_patient_cadastros";

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `p-${Date.now()}`;
}

export const SEED_PATIENTS: StoredPatient[] = [
  {
    id: "p3",
    createdAt: "2026-01-10T12:00:00.000Z",
    updatedAt: "2026-08-01T12:00:00.000Z",
    fullName: "Marina Alves",
    cpf: "39053344705",
    birthDate: "1992-04-18",
    phone: "11988880101",
    email: "paciente@florescer.clinica",
    addressStreet: "Rua das Camélias",
    addressNumber: "120",
    addressComplement: "Apto 42",
    addressDistrict: "Jardins",
    addressCity: "São Paulo",
    addressState: "SP",
    addressCep: "01415000",
    careSpecialties: ["gynecology"],
    billingModality: "private",
    insuranceName: "",
    insuranceCardNumber: "",
    insuranceValidUntil: "",
    privatePaymentMethod: "pix",
    pregnancies: 0,
    births: 0,
    abortions: 0,
    lmpDate: "",
    gynProcedures: [],
    comorbidities: "",
    continuousMedications: "",
    allergies: "Nega alergias",
    edd: "",
  },
  {
    id: "p1",
    createdAt: "2025-11-20T12:00:00.000Z",
    updatedAt: "2026-08-10T12:00:00.000Z",
    fullName: "Carla Menezes",
    cpf: "52998224725",
    birthDate: "1988-09-02",
    phone: "11900000002",
    email: "carla.menezes@email.com",
    addressStreet: "Av. Brasil",
    addressNumber: "890",
    addressComplement: "",
    addressDistrict: "Moema",
    addressCity: "São Paulo",
    addressState: "SP",
    addressCep: "04097000",
    careSpecialties: ["obstetrics"],
    billingModality: "insurance",
    insuranceName: "Unimed",
    insuranceCardNumber: "1234567890",
    insuranceValidUntil: "2027-03-31",
    privatePaymentMethod: undefined,
    pregnancies: 2,
    births: 1,
    abortions: 0,
    lmpDate: "2025-11-15",
    gynProcedures: [],
    comorbidities: "PA controlada",
    continuousMedications: "Sulfato ferroso",
    allergies: "Nega alergias",
    edd: "2026-08-22",
  },
  {
    id: "p2",
    createdAt: "2026-02-01T12:00:00.000Z",
    updatedAt: "2026-08-12T12:00:00.000Z",
    fullName: "Juliana Prado",
    cpf: "15350946056",
    birthDate: "1995-01-27",
    phone: "11900000004",
    email: "juliana.prado@email.com",
    addressStreet: "Rua Harmonia",
    addressNumber: "55",
    addressComplement: "",
    addressDistrict: "Vila Madalena",
    addressCity: "São Paulo",
    addressState: "SP",
    addressCep: "05435000",
    careSpecialties: ["obstetrics"],
    billingModality: "private",
    insuranceName: "",
    insuranceCardNumber: "",
    insuranceValidUntil: "",
    privatePaymentMethod: "card",
    pregnancies: 1,
    births: 0,
    abortions: 0,
    lmpDate: "2025-11-21",
    gynProcedures: [],
    comorbidities: "HAS",
    continuousMedications: "Metildopa",
    allergies: "Dipirona",
    edd: "2026-08-28",
  },
  {
    id: "preview-helena",
    createdAt: "2026-03-15T12:00:00.000Z",
    updatedAt: "2026-07-20T12:00:00.000Z",
    fullName: "Helena Dias",
    cpf: "11144477735",
    birthDate: "1985-06-09",
    phone: "11900000003",
    email: "helena.dias@email.com",
    addressStreet: "Rua Augusta",
    addressNumber: "2100",
    addressComplement: "",
    addressDistrict: "Consolação",
    addressCity: "São Paulo",
    addressState: "SP",
    addressCep: "01305000",
    careSpecialties: ["gynecology"],
    billingModality: "private",
    insuranceName: "",
    insuranceCardNumber: "",
    insuranceValidUntil: "",
    privatePaymentMethod: "cash",
    pregnancies: 1,
    births: 1,
    abortions: 0,
    lmpDate: "",
    gynProcedures: ["DIU de cobre (2022)"],
    comorbidities: "",
    continuousMedications: "",
    allergies: "",
    edd: "",
  },
];

function readRaw(): StoredPatient[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPatient[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeAll(rows: StoredPatient[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

export function listStoredPatients(): StoredPatient[] {
  const stored = readRaw();
  if (!stored || stored.length === 0) {
    return [...SEED_PATIENTS].sort((a, b) => a.fullName.localeCompare(b.fullName, "pt-BR"));
  }
  const byId = new Map(stored.map((row) => [row.id, row]));
  for (const seed of SEED_PATIENTS) {
    if (!byId.has(seed.id)) byId.set(seed.id, seed);
  }
  return [...byId.values()].sort((a, b) => a.fullName.localeCompare(b.fullName, "pt-BR"));
}

const ID_ALIAS: Record<string, string> = {
  "preview-patient": "p3",
};

export function getSeedPatient(id: string): StoredPatient | null {
  const resolved = ID_ALIAS[id] ?? id;
  return SEED_PATIENTS.find((row) => row.id === resolved) ?? null;
}

export function getStoredPatient(id: string): StoredPatient | null {
  const resolved = ID_ALIAS[id] ?? id;
  return listStoredPatients().find((row) => row.id === resolved) ?? null;
}

export function toFormValues(row: StoredPatient): PatientCadastroValues {
  const { id: _id, createdAt: _c, updatedAt: _u, edd: _e, ...rest } = row;
  return rest;
}

async function persistToSupabase(row: StoredPatient) {
  const supabase = createClient();
  if (!supabase || isStaticHosting()) return;
  const specialties = row.careSpecialties;
  const isInsurance = row.billingModality === "insurance";
  const { error: mpiError } = await supabase.from("patients").upsert({
    id: row.id,
    full_name: row.fullName,
    cpf: onlyDigits(row.cpf),
    birth_date: row.birthDate,
    phone: onlyDigits(row.phone),
    email: row.email,
    address_street: row.addressStreet,
    address_number: row.addressNumber,
    address_complement: row.addressComplement || null,
    address_district: row.addressDistrict,
    address_city: row.addressCity,
    address_state: row.addressState,
    address_cep: onlyDigits(row.addressCep),
    care_specialties: specialties,
    billing_modality: row.billingModality,
    insurance_name: isInsurance ? row.insuranceName : null,
    insurance_card_number: isInsurance ? row.insuranceCardNumber : null,
    insurance_valid_until: isInsurance ? row.insuranceValidUntil || null : null,
    private_payment_method: isInsurance ? null : row.privatePaymentMethod ?? null,
  });
  if (mpiError) throw mpiError;
  const { error: clinicalError } = await supabase.from("patient_clinical_data").upsert(
    {
      patient_id: row.id,
      pregnancies: row.pregnancies,
      births: row.births,
      abortions: row.abortions,
      lmp_date: row.lmpDate || null,
      edd: row.edd || null,
      gyn_procedures: row.gynProcedures,
      comorbidities: row.comorbidities || null,
      continuous_medications: row.continuousMedications || null,
      allergies: row.allergies || null,
    },
    { onConflict: "patient_id" },
  );
  if (clinicalError) throw clinicalError;
}

export async function saveStoredPatient(
  values: PatientCadastroValues,
  existingId?: string,
): Promise<StoredPatient> {
  const now = new Date().toISOString();
  const previous = existingId ? getStoredPatient(existingId) : null;
  const row: StoredPatient = {
    ...values,
    id: previous?.id ?? existingId ?? uid(),
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    cpf: onlyDigits(values.cpf),
    phone: onlyDigits(values.phone),
    addressCep: onlyDigits(values.addressCep),
    edd: values.careSpecialties.includes("obstetrics") ? eddFromLmp(values.lmpDate) : "",
  };
  const next = listStoredPatients().filter((item) => item.id !== row.id);
  next.push(row);
  writeAll(next);
  try {
    await persistToSupabase(row);
  } catch {
    // Preview estático continua com localStorage; o erro de RLS/sessão não bloqueia a ficha.
  }
  return row;
}
