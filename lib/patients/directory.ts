import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidCpf, onlyDigits } from "@/lib/patients/format";

export const PATIENT_LIST_COLUMNS =
  "id, organization_id, full_name, social_name, cpf, birth_date, phone, email, created_by, created_at" as const;

export const PATIENT_LIST_PHOTO_COLUMNS = `${PATIENT_LIST_COLUMNS}, photo_path` as const;

export const PATIENT_DETAIL_COLUMNS = `${PATIENT_LIST_PHOTO_COLUMNS}, preferred_channel, address_street, address_number, address_complement, address_district, address_city, address_state, address_cep, reception_notes, care_specialties, billing_modality, insurance_name, insurance_card_number, insurance_valid_until, private_payment_method` as const;

export const PATIENT_PHOTO_BUCKET = "patient-photos";
export const PATIENT_PHOTO_SIGNED_SECONDS = 120;
export const PATIENT_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const PATIENT_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const PATIENT_PHOTO_INVALID_MESSAGE =
  "Selecione uma fotografia JPG, PNG ou WebP de até 2 MB.";

export type PatientPhotoMime = (typeof PATIENT_PHOTO_MIME_TYPES)[number];

export const CARE_SPECIALTIES = ["gynecology", "obstetrics"] as const;
export type CareSpecialty = (typeof CARE_SPECIALTIES)[number];

export const BILLING_MODALITIES = ["private", "insurance"] as const;
export type BillingModality = (typeof BILLING_MODALITIES)[number];

export const PRIVATE_PAYMENT_METHODS = ["pix", "card", "cash"] as const;
export type PrivatePaymentMethod = (typeof PRIVATE_PAYMENT_METHODS)[number];

export const PREFERRED_CHANNELS = ["whatsapp", "phone", "email", "other"] as const;
export type PreferredChannel = (typeof PREFERRED_CHANNELS)[number];

export const PREFERRED_CHANNEL_LABEL: Record<PreferredChannel, string> = {
  whatsapp: "WhatsApp",
  phone: "Telefone",
  email: "E-mail",
  other: "Outro",
};

export const CARE_SPECIALTY_LABEL: Record<CareSpecialty, string> = {
  gynecology: "Ginecologia",
  obstetrics: "Obstetrícia",
};

export const BILLING_MODALITY_LABEL: Record<BillingModality, string> = {
  private: "Particular",
  insurance: "Plano/Convênio",
};

export const PRIVATE_PAYMENT_METHOD_LABEL: Record<PrivatePaymentMethod, string> = {
  pix: "Pix",
  card: "Cartão",
  cash: "Dinheiro",
};

export const BRAZIL_UFS = [
  "AC",
  "AL",
  "AM",
  "AP",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "PI",
  "PR",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "SP",
  "TO",
] as const;

export type BrazilUf = (typeof BRAZIL_UFS)[number];

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

export type PatientDetailRow = PatientListRow & {
  preferredChannel: PreferredChannel;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressDistrict: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressCep: string | null;
  receptionNotes: string | null;
  careSpecialties: CareSpecialty[];
  billingModality: BillingModality | null;
  insuranceName: string | null;
  insuranceCardNumber: string | null;
  insuranceValidUntil: string | null;
  privatePaymentMethod: PrivatePaymentMethod | null;
};

export type PatientCreateInput = {
  fullName: string;
  socialName: string;
  cpf: string;
  birthDate: string;
  phone: string;
  email: string;
  preferredChannel: PreferredChannel;
  addressStreet: string;
  addressNumber: string;
  addressComplement: string;
  addressDistrict: string;
  addressCity: string;
  addressState: string;
  addressCep: string;
  receptionNotes: string;
  careSpecialties: CareSpecialty[];
  billingModality: "" | BillingModality;
  insuranceName: string;
  insuranceCardNumber: string;
  insuranceValidUntil: string;
  privatePaymentMethod: "" | PrivatePaymentMethod;
};

export type PatientCreateContext = {
  organizationId: string;
  createdBy: string;
};

export type PatientUpdateInput = PatientCreateInput;

export const emptyPatientForm = (): PatientCreateInput => ({
  fullName: "",
  socialName: "",
  cpf: "",
  birthDate: "",
  phone: "",
  email: "",
  preferredChannel: "whatsapp",
  addressStreet: "",
  addressNumber: "",
  addressComplement: "",
  addressDistrict: "",
  addressCity: "",
  addressState: "",
  addressCep: "",
  receptionNotes: "",
  careSpecialties: [],
  billingModality: "",
  insuranceName: "",
  insuranceCardNumber: "",
  insuranceValidUntil: "",
  privatePaymentMethod: "",
});

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UF_PATTERN = /^[A-Z]{2}$/;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isPreferredChannel(value: unknown): value is PreferredChannel {
  return typeof value === "string" && (PREFERRED_CHANNELS as readonly string[]).includes(value);
}

function isCareSpecialty(value: unknown): value is CareSpecialty {
  return typeof value === "string" && (CARE_SPECIALTIES as readonly string[]).includes(value);
}

function isBillingModality(value: unknown): value is BillingModality {
  return value === "private" || value === "insurance";
}

function isPrivatePaymentMethod(value: unknown): value is PrivatePaymentMethod {
  return value === "pix" || value === "card" || value === "cash";
}

function parseCareSpecialties(value: unknown): CareSpecialty[] {
  if (!Array.isArray(value)) return [];
  const unique: CareSpecialty[] = [];
  for (const item of value) {
    if (isCareSpecialty(item) && !unique.includes(item)) unique.push(item);
  }
  return unique;
}

function parsePreferredChannel(value: unknown): PreferredChannel {
  return isPreferredChannel(value) ? value : "whatsapp";
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
  if (error.code === "23514" || text.includes("check constraint") || text.includes("patients_billing_shape")) {
    return "Os dados de faturamento estão incompletos ou incompatíveis.";
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
  if (error.code === "23514" || text.includes("check constraint") || text.includes("patients_billing_shape")) {
    return "Os dados de faturamento estão incompletos ou incompatíveis.";
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

export function applyBillingModalityChange(
  current: PatientCreateInput,
  billingModality: "" | BillingModality,
): PatientCreateInput {
  if (billingModality === "private") {
    return {
      ...current,
      billingModality,
      insuranceName: "",
      insuranceCardNumber: "",
      insuranceValidUntil: "",
    };
  }
  if (billingModality === "insurance") {
    return {
      ...current,
      billingModality,
      privatePaymentMethod: "",
    };
  }
  return {
    ...current,
    billingModality: "",
    insuranceName: "",
    insuranceCardNumber: "",
    insuranceValidUntil: "",
    privatePaymentMethod: "",
  };
}

export function toggleCareSpecialty(
  current: CareSpecialty[],
  specialty: CareSpecialty,
): CareSpecialty[] {
  return current.includes(specialty)
    ? current.filter((item) => item !== specialty)
    : [...current, specialty];
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

  if (!isPreferredChannel(input.preferredChannel)) {
    return "Selecione o canal preferencial.";
  }

  const cepDigits = onlyDigits(input.addressCep);
  if (cepDigits.length > 0 && cepDigits.length !== 8) {
    return "Informe um CEP com 8 dígitos.";
  }

  const uf = input.addressState.trim().toUpperCase();
  if (uf.length > 0 && !UF_PATTERN.test(uf)) {
    return "Informe uma UF com 2 letras.";
  }

  if (!Array.isArray(input.careSpecialties) || input.careSpecialties.some((item) => !isCareSpecialty(item))) {
    return "Selecione somente Ginecologia e/ou Obstetrícia.";
  }

  const modality = input.billingModality;
  if (modality !== "" && !isBillingModality(modality)) {
    return "Selecione a modalidade de faturamento.";
  }

  if (modality === "private") {
    if (!isPrivatePaymentMethod(input.privatePaymentMethod)) {
      return "Selecione Pix, cartão ou dinheiro.";
    }
  }

  if (modality === "insurance") {
    if (!input.insuranceName.trim()) {
      return "Informe o nome do convênio.";
    }
    if (!input.insuranceCardNumber.trim()) {
      return "Informe o número da carteirinha.";
    }
    const validUntil = input.insuranceValidUntil.trim();
    if (validUntil.length > 0) {
      const parsed = new Date(`${validUntil}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) {
        return "Informe uma validade da carteirinha válida.";
      }
    }
  }

  return null;
}

function toListRow(value: Record<string, unknown>): PatientListRow | null {
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

function toDetailRow(value: Record<string, unknown>): PatientDetailRow | null {
  const base = toListRow(value);
  if (!base) return null;
  const privatePayment = value.private_payment_method;
  return {
    ...base,
    preferredChannel: parsePreferredChannel(value.preferred_channel),
    addressStreet: asTrimmed(value.address_street),
    addressNumber: asTrimmed(value.address_number),
    addressComplement: asTrimmed(value.address_complement),
    addressDistrict: asTrimmed(value.address_district),
    addressCity: asTrimmed(value.address_city),
    addressState: asTrimmed(value.address_state)?.toUpperCase() ?? null,
    addressCep: asTrimmed(value.address_cep) ? onlyDigits(String(value.address_cep)) : null,
    receptionNotes: asTrimmed(value.reception_notes),
    careSpecialties: parseCareSpecialties(value.care_specialties),
    billingModality: isBillingModality(value.billing_modality) ? value.billing_modality : null,
    insuranceName: asTrimmed(value.insurance_name),
    insuranceCardNumber: asTrimmed(value.insurance_card_number),
    insuranceValidUntil: asTrimmed(value.insurance_valid_until),
    privatePaymentMethod: isPrivatePaymentMethod(privatePayment) ? privatePayment : null,
  };
}

export function patientDetailToForm(row: PatientDetailRow): PatientCreateInput {
  return {
    fullName: row.fullName,
    socialName: row.socialName ?? "",
    cpf: row.cpf ?? "",
    birthDate: row.birthDate ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    preferredChannel: row.preferredChannel,
    addressStreet: row.addressStreet ?? "",
    addressNumber: row.addressNumber ?? "",
    addressComplement: row.addressComplement ?? "",
    addressDistrict: row.addressDistrict ?? "",
    addressCity: row.addressCity ?? "",
    addressState: row.addressState ?? "",
    addressCep: row.addressCep ?? "",
    receptionNotes: row.receptionNotes ?? "",
    careSpecialties: row.careSpecialties,
    billingModality: row.billingModality ?? "",
    insuranceName: row.insuranceName ?? "",
    insuranceCardNumber: row.insuranceCardNumber ?? "",
    insuranceValidUntil: row.insuranceValidUntil ?? "",
    privatePaymentMethod: row.privatePaymentMethod ?? "",
  };
}

function toPersistPayload(input: PatientCreateInput) {
  const cepDigits = onlyDigits(input.addressCep);
  const uf = input.addressState.trim().toUpperCase();
  const modality = isBillingModality(input.billingModality) ? input.billingModality : null;

  const billing =
    modality === "private"
      ? {
          billing_modality: "private" as const,
          private_payment_method: input.privatePaymentMethod as PrivatePaymentMethod,
          insurance_name: null,
          insurance_card_number: null,
          insurance_valid_until: null,
        }
      : modality === "insurance"
        ? {
            billing_modality: "insurance" as const,
            private_payment_method: null,
            insurance_name: input.insuranceName.trim(),
            insurance_card_number: input.insuranceCardNumber.trim(),
            insurance_valid_until: optionalText(input.insuranceValidUntil),
          }
        : {
            billing_modality: null,
            private_payment_method: null,
            insurance_name: null,
            insurance_card_number: null,
            insurance_valid_until: null,
          };

  return {
    full_name: input.fullName.trim(),
    social_name: optionalText(input.socialName),
    cpf: onlyDigits(input.cpf).length === 11 ? onlyDigits(input.cpf) : null,
    birth_date: optionalText(input.birthDate),
    phone: onlyDigits(input.phone).length > 0 ? onlyDigits(input.phone) : null,
    email: optionalText(input.email),
    preferred_channel: input.preferredChannel,
    address_street: optionalText(input.addressStreet),
    address_number: optionalText(input.addressNumber),
    address_complement: optionalText(input.addressComplement),
    address_district: optionalText(input.addressDistrict),
    address_city: optionalText(input.addressCity),
    address_state: uf.length > 0 ? uf : null,
    address_cep: cepDigits.length > 0 ? cepDigits : null,
    reception_notes: optionalText(input.receptionNotes),
    care_specialties: parseCareSpecialties(input.careSpecialties),
    ...billing,
  };
}

export async function listPatients(supabase: SupabaseClient): Promise<PatientListRow[]> {
  let result = await supabase.from("patients").select(PATIENT_LIST_PHOTO_COLUMNS).order("full_name");

  if (result.error && isMissingPhotoPathColumn(result.error)) {
    result = await supabase.from("patients").select(PATIENT_LIST_COLUMNS).order("full_name");
  }

  if (result.error) {
    logPatientError("list", result.error);
    throw new Error(mapListError(result.error));
  }

  return (result.data ?? []).flatMap((item) => {
    const row = toListRow(item as Record<string, unknown>);
    return row ? [row] : [];
  });
}

export async function getPatient(
  supabase: SupabaseClient,
  patientId: string,
): Promise<PatientDetailRow | null> {
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
  return toDetailRow(result.data as Record<string, unknown>);
}

export async function createPatient(
  supabase: SupabaseClient,
  input: PatientCreateInput,
  context: PatientCreateContext,
): Promise<PatientDetailRow> {
  const message = validatePatientCreateInput(input);
  if (message) throw new Error(message);
  if (!context.organizationId || !context.createdBy) {
    throw new Error("Não foi possível identificar o vínculo da sessão atual.");
  }

  const { data, error } = await supabase
    .from("patients")
    .insert({
      ...toPersistPayload(input),
      organization_id: context.organizationId,
      created_by: context.createdBy,
    })
    .select(PATIENT_DETAIL_COLUMNS)
    .single();

  if (error) {
    logPatientError("create", error);
    throw new Error(mapCreateError(error));
  }
  const row = toDetailRow(data as Record<string, unknown>);
  if (!row) throw new Error("Não foi possível cadastrar a paciente. Tente novamente.");
  return row;
}

export async function updatePatient(
  supabase: SupabaseClient,
  patientId: string,
  input: PatientUpdateInput,
): Promise<PatientDetailRow> {
  const message = validatePatientCreateInput(input);
  if (message) throw new Error(message);
  if (!patientId) {
    throw new Error("Não foi possível identificar a paciente.");
  }

  const { data, error } = await supabase
    .from("patients")
    .update(toPersistPayload(input))
    .eq("id", patientId)
    .select(PATIENT_DETAIL_COLUMNS)
    .single();

  if (error) {
    logPatientError("update", error);
    throw new Error(mapUpdateError(error));
  }
  const row = toDetailRow(data as Record<string, unknown>);
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
