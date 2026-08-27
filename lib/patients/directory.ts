import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidCpf, onlyDigits } from "@/lib/patients/format";

export const PATIENT_LIST_COLUMNS =
  "id, organization_id, full_name, social_name, cpf, birth_date, phone, email, created_by, created_at" as const;

export const PATIENT_DETAIL_COLUMNS = `${PATIENT_LIST_COLUMNS}, photo_path` as const;

export const PATIENT_PHOTO_BUCKET = "patient-photos";
export const PATIENT_PHOTO_SIGNED_SECONDS = 120;
export const PATIENT_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const PATIENT_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const PATIENT_PHOTO_INVALID_MESSAGE =
  "Selecione uma fotografia JPG, PNG ou WebP de até 2 MB.";

export type PatientPhotoMime = (typeof PATIENT_PHOTO_MIME_TYPES)[number];

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
  photoPath: string | null;
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

export type PatientUpdateInput = PatientCreateInput;

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

function mapPhotoError(error: { code?: string; message?: string }): string {
  if (isRlsError(error)) {
    return "A sessão atual não possui permissão para alterar a fotografia.";
  }
  return "Não foi possível alterar a fotografia. Tente novamente.";
}

function mapUpdateError(error: { code?: string; message?: string }): string {
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  if (error.code === "23505" || text.includes("duplicate") || text.includes("unique")) {
    return "Já existe uma paciente cadastrada com este CPF.";
  }
  if (isRlsError(error) || error.code === "PGRST116") {
    return "A sessão atual não possui permissão para alterar este cadastro.";
  }
  return "Não foi possível alterar o cadastro da paciente. Tente novamente.";
}

function isMissingPhotoPathColumn(error: { code?: string; message?: string }) {
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return text.includes("photo_path") && text.includes("does not exist");
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function patientPhotoObjectPath(organizationId: string, patientId: string): string {
  if (!UUID_PATTERN.test(organizationId) || !UUID_PATTERN.test(patientId)) {
    throw new Error("Não foi possível identificar o vínculo da sessão atual.");
  }
  return `${organizationId}/${patientId}/photo`;
}

export function isAllowedPatientPhotoMime(value: string): value is PatientPhotoMime {
  return (PATIENT_PHOTO_MIME_TYPES as readonly string[]).includes(value);
}

export async function validatePatientPhotoFile(file: File): Promise<string | null> {
  if (!isAllowedPatientPhotoMime(file.type) || file.size > PATIENT_PHOTO_MAX_BYTES || file.size <= 0) {
    return PATIENT_PHOTO_INVALID_MESSAGE;
  }
  try {
    const bitmap = await createImageBitmap(file);
    bitmap.close();
  } catch {
    return PATIENT_PHOTO_INVALID_MESSAGE;
  }
  return null;
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
    photoPath: asString(value.photo_path),
  };
}

export async function listPatients(supabase: SupabaseClient): Promise<PatientListRow[]> {
  let result = await supabase.from("patients").select(PATIENT_DETAIL_COLUMNS).order("full_name");

  if (result.error && isMissingPhotoPathColumn(result.error)) {
    result = await supabase.from("patients").select(PATIENT_LIST_COLUMNS).order("full_name");
  }

  if (result.error) {
    logPatientError("list", result.error);
    throw new Error(mapListError(result.error));
  }

  return (result.data ?? []).flatMap((item) => {
    const row = toRow(item as Record<string, unknown>);
    return row ? [row] : [];
  });
}

export async function getPatient(
  supabase: SupabaseClient,
  patientId: string,
): Promise<PatientListRow | null> {
  let result = await supabase
    .from("patients")
    .select(PATIENT_DETAIL_COLUMNS)
    .eq("id", patientId)
    .maybeSingle();

  if (result.error && isMissingPhotoPathColumn(result.error)) {
    result = await supabase
      .from("patients")
      .select(PATIENT_LIST_COLUMNS)
      .eq("id", patientId)
      .maybeSingle();
  }

  if (result.error) {
    logPatientError("get", result.error);
    throw new Error(mapGetError(result.error));
  }
  if (!result.data) return null;
  return toRow(result.data as Record<string, unknown>);
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

export async function updatePatient(
  supabase: SupabaseClient,
  patientId: string,
  input: PatientUpdateInput,
): Promise<PatientListRow> {
  const message = validatePatientCreateInput(input);
  if (message) throw new Error(message);
  if (!patientId) {
    throw new Error("Não foi possível identificar a paciente.");
  }

  const fullName = input.fullName.trim();
  const socialName = input.socialName.trim();
  const cpfDigits = onlyDigits(input.cpf);
  const phoneDigits = onlyDigits(input.phone);
  const email = input.email.trim();
  const birthDate = input.birthDate.trim();

  const { data, error } = await supabase
    .from("patients")
    .update({
      full_name: fullName,
      social_name: socialName.length > 0 ? socialName : null,
      cpf: cpfDigits.length === 11 ? cpfDigits : null,
      birth_date: birthDate.length > 0 ? birthDate : null,
      phone: phoneDigits.length > 0 ? phoneDigits : null,
      email: email.length > 0 ? email : null,
    })
    .eq("id", patientId)
    .select(PATIENT_LIST_COLUMNS)
    .single();

  if (error) {
    logPatientError("update", error);
    throw new Error(mapUpdateError(error));
  }
  const row = toRow(data as Record<string, unknown>);
  if (!row) throw new Error("Não foi possível alterar o cadastro da paciente. Tente novamente.");
  return row;
}

async function setPatientPhotoPath(
  supabase: SupabaseClient,
  patientId: string,
  organizationId: string,
  photoPath: string | null,
) {
  const { error } = await supabase
    .from("patients")
    .update({ photo_path: photoPath })
    .eq("id", patientId)
    .eq("organization_id", organizationId);
  if (error) {
    logPatientError("photo_path", error);
    throw new Error(mapPhotoError(error));
  }
}

export async function getPatientPhotoUrl(
  supabase: SupabaseClient,
  photoPath: string | null,
): Promise<string | null> {
  if (!photoPath) return null;
  const { data, error } = await supabase.storage
    .from(PATIENT_PHOTO_BUCKET)
    .createSignedUrl(photoPath, PATIENT_PHOTO_SIGNED_SECONDS);
  if (error) {
    logPatientError("photo_url", error);
    throw new Error(mapPhotoError(error));
  }
  return data.signedUrl;
}

export async function uploadPatientPhoto(
  supabase: SupabaseClient,
  organizationId: string,
  patientId: string,
  file: File,
): Promise<string> {
  const validation = await validatePatientPhotoFile(file);
  if (validation) throw new Error(validation);
  const path = patientPhotoObjectPath(organizationId, patientId);
  const { error: uploadError } = await supabase.storage.from(PATIENT_PHOTO_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type,
    cacheControl: "120",
  });
  if (uploadError) {
    logPatientError("photo_upload", uploadError);
    throw new Error(mapPhotoError(uploadError));
  }
  try {
    await setPatientPhotoPath(supabase, patientId, organizationId, path);
  } catch (error) {
    const { error: cleanupError } = await supabase.storage.from(PATIENT_PHOTO_BUCKET).remove([path]);
    if (cleanupError) logPatientError("photo_upload_cleanup", cleanupError);
    throw error;
  }
  return path;
}

export async function removePatientPhoto(
  supabase: SupabaseClient,
  organizationId: string,
  patientId: string,
): Promise<void> {
  const path = patientPhotoObjectPath(organizationId, patientId);
  const { error: storageError } = await supabase.storage.from(PATIENT_PHOTO_BUCKET).remove([path]);
  if (storageError) {
    logPatientError("photo_remove", storageError);
    throw new Error(mapPhotoError(storageError));
  }
  try {
    await setPatientPhotoPath(supabase, patientId, organizationId, null);
  } catch (error) {
    logPatientError("photo_remove_sync", {
      message: error instanceof Error ? error.message : "photo_path update failed after storage remove",
    });
    throw new Error("A fotografia precisa ser sincronizada. Tente novamente.");
  }
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
