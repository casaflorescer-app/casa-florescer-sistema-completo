import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidCpf, onlyDigits } from "@/lib/patients/format";

export const PATIENT_LIST_COLUMNS =
  "id, organization_id, full_name, social_name, cpf, birth_date, phone, email, created_by, created_at" as const;

export type PatientListRow = {
  id: string;
  organizationId: string;
  fullName: string;
  socialName: string | null;
  cpf: string | null;
  birthDate: string | null;
  phone: string | null;
  email: string | null;
  createdBy: string | null;
  createdAt: string;
};

export type PatientCreateInput = {
  fullName: string;
  socialName: string;
  cpf: string;
  birthDate: string;
  phone: string;
  email: string;
};

export type PatientCreateContext = {
  organizationId: string;
  createdBy: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function logPatientError(scope: string, error: { code?: string; message?: string; details?: string; hint?: string }) {
  console.error(`[patients] ${scope} failed`, {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });
}

function isRlsError(error: { code?: string; message?: string }) {
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return (
    error.code === "42501" ||
    text.includes("row-level security") ||
    text.includes("permission denied") ||
    text.includes("not authorized") ||
    text.includes("rls")
  );
}

function mapListError(error: { code?: string; message?: string }): string {
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  if (isRlsError(error)) {
    return "Não foi possível ler patients com a sessão atual.";
  }
  if (text.includes("failed to fetch") || text.includes("network") || text.includes("fetch")) {
    return "Não foi possível conectar para carregar as pacientes.";
  }
  if (text.includes("column") && text.includes("does not exist")) {
    return "A consulta a patients não corresponde ao schema esperado.";
  }
  return "Não foi possível carregar as pacientes.";
}

function mapCreateError(error: { code?: string; message?: string }): string {
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  if (error.code === "23505" || text.includes("duplicate") || text.includes("unique")) {
    return "Já existe uma paciente cadastrada com este CPF.";
  }
  if (isRlsError(error)) {
    return "A sessão atual não possui permissão para realizar este cadastro.";
  }
  return "Não foi possível cadastrar a paciente. Tente novamente.";
}

function mapGetError(error: { code?: string; message?: string }): string {
  if (isRlsError(error)) {
    return "Paciente não encontrada ou sem permissão para visualização.";
  }
  return mapListError(error);
}

export function validatePatientCreateInput(input: PatientCreateInput): string | null {
  const fullName = input.fullName.trim();
  if (fullName.length < 3) {
    return "Informe o nome completo (mínimo de 3 caracteres).";
  }

  const cpfDigits = onlyDigits(input.cpf);
  if (cpfDigits.length > 0) {
    if (cpfDigits.length !== 11 || !isValidCpf(cpfDigits)) {
      return "Informe um CPF válido com 11 dígitos.";
    }
  }

  const email = input.email.trim();
  if (email.length > 0 && !EMAIL_PATTERN.test(email)) {
    return "Informe um e-mail válido.";
  }

  const birthDate = input.birthDate.trim();
  if (birthDate.length > 0) {
    const parsed = new Date(`${birthDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (Number.isNaN(parsed.getTime()) || parsed > today) {
      return "Informe uma data de nascimento válida, sem data futura.";
    }
  }

  return null;
}

function toRow(value: Record<string, unknown>): PatientListRow | null {
  const id = asString(value.id);
  const organizationId = asString(value.organization_id);
  const fullName = asString(value.full_name);
  const createdAt = asString(value.created_at);
  if (!id || !organizationId || !fullName || !createdAt) return null;
  return {
    id,
    organizationId,
    fullName,
    socialName: asString(value.social_name),
    cpf: asString(value.cpf),
    birthDate: asString(value.birth_date),
    phone: asString(value.phone),
    email: asString(value.email),
    createdBy: asString(value.created_by),
    createdAt,
  };
}

export async function listPatients(supabase: SupabaseClient): Promise<PatientListRow[]> {
  const { data, error } = await supabase
    .from("patients")
    .select(PATIENT_LIST_COLUMNS)
    .order("full_name");

  if (error) {
    logPatientError("list", error);
    throw new Error(mapListError(error));
  }

  return (data ?? []).flatMap((item) => {
    const row = toRow(item as Record<string, unknown>);
    return row ? [row] : [];
  });
}

export async function getPatient(
  supabase: SupabaseClient,
  patientId: string,
): Promise<PatientListRow | null> {
  const { data, error } = await supabase
    .from("patients")
    .select(PATIENT_LIST_COLUMNS)
    .eq("id", patientId)
    .maybeSingle();

  if (error) {
    logPatientError("get", error);
    throw new Error(mapGetError(error));
  }
  if (!data) return null;
  return toRow(data as Record<string, unknown>);
}

export async function createPatient(
  supabase: SupabaseClient,
  input: PatientCreateInput,
  context: PatientCreateContext,
): Promise<PatientListRow> {
  const message = validatePatientCreateInput(input);
  if (message) throw new Error(message);
  if (!context.organizationId || !context.createdBy) {
    throw new Error("Não foi possível identificar o vínculo da sessão atual.");
  }

  const fullName = input.fullName.trim();
  const socialName = input.socialName.trim();
  const cpfDigits = onlyDigits(input.cpf);
  const phoneDigits = onlyDigits(input.phone);
  const email = input.email.trim();
  const birthDate = input.birthDate.trim();

  const { data, error } = await supabase
    .from("patients")
    .insert({
      full_name: fullName,
      social_name: socialName.length > 0 ? socialName : null,
      cpf: cpfDigits.length === 11 ? cpfDigits : null,
      birth_date: birthDate.length > 0 ? birthDate : null,
      phone: phoneDigits.length > 0 ? phoneDigits : null,
      email: email.length > 0 ? email : null,
      organization_id: context.organizationId,
      created_by: context.createdBy,
    })
    .select(PATIENT_LIST_COLUMNS)
    .single();

  if (error) {
    logPatientError("create", error);
    throw new Error(mapCreateError(error));
  }
  const row = toRow(data as Record<string, unknown>);
  if (!row) throw new Error("Não foi possível cadastrar a paciente. Tente novamente.");
  return row;
}

/** Máscara de apresentação. Não altera o valor persistido. */
export function maskCpf(value: string | null): string {
  if (!value) return "—";
  const digits = onlyDigits(value);
  if (digits.length !== 11) return "—";
  return `***.***.***-${digits.slice(9)}`;
}

export function matchesPatientQuery(row: PatientListRow, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  const queryDigits = onlyDigits(query);
  const name = row.fullName.toLowerCase();
  const social = (row.socialName ?? "").toLowerCase();
  if (name.includes(query) || social.includes(query)) return true;
  if (queryDigits.length > 0) {
    const phoneDigits = onlyDigits(row.phone ?? "");
    const cpfDigits = onlyDigits(row.cpf ?? "");
    if (phoneDigits.includes(queryDigits) || cpfDigits.includes(queryDigits)) return true;
  }
  return false;
}
