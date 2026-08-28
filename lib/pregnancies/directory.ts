import type { SupabaseClient } from "@supabase/supabase-js";
import { eddFromLmp } from "@/lib/patients/format";
import type { PregnancyEventKind, PregnancyRisk, PregnancyStatus } from "@/lib/types/database";

export const PREGNANCY_STATUSES = ["in_care", "closed", "transferred", "cancelled"] as const;
export const PREGNANCY_RISKS = ["habitual", "high"] as const;
export const TERMINAL_PREGNANCY_STATUSES = ["closed", "transferred", "cancelled"] as const;

export const PREGNANCY_STATUS_LABEL: Record<PregnancyStatus, string> = {
  in_care: "Em acompanhamento",
  closed: "Encerrada",
  transferred: "Transferida",
  cancelled: "Cancelada",
};

export const PREGNANCY_RISK_LABEL: Record<PregnancyRisk, string> = {
  habitual: "Risco habitual",
  high: "Alto risco",
};

export const PREGNANCY_EVENT_LABEL: Record<PregnancyEventKind, string> = {
  created: "Criação",
  updated: "Atualização",
  principal_changed: "Médica principal",
  backup_changed: "Médica de retaguarda",
  practice_changed: "Prática",
  closed: "Encerramento",
  transferred: "Transferência",
  cancelled: "Cancelamento",
  backup_access_granted: "Autorização da retaguarda",
  backup_access_revoked: "Revogação da retaguarda",
};

const PREGNANCY_COLUMNS =
  "id, organization_id, practice_id, patient_id, primary_professional_id, backup_professional_id, lmp_date, calculated_edd, clinical_edd, pregnancy_number, risk, care_started_on, notes, status, status_reason, status_changed_at, status_changed_by, created_by, created_at, updated_at" as const;

export type ProfessionalLabel = {
  id: string;
  practiceId: string;
  organizationId: string;
  fullName: string;
  councilType: string;
  councilNumber: string;
};

export type PregnancyRow = {
  id: string;
  organizationId: string;
  practiceId: string;
  patientId: string;
  primaryProfessionalId: string;
  backupProfessionalId: string | null;
  lmpDate: string | null;
  calculatedEdd: string | null;
  clinicalEdd: string | null;
  pregnancyNumber: number | null;
  risk: PregnancyRisk | null;
  careStartedOn: string | null;
  notes: string | null;
  status: PregnancyStatus;
  statusReason: string | null;
  statusChangedAt: string | null;
  statusChangedBy: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  practiceName: string | null;
  primaryName: string | null;
  backupName: string | null;
  patientName: string | null;
};

export type PregnancyEventRow = {
  id: string;
  pregnancyId: string;
  kind: PregnancyEventKind;
  actorId: string | null;
  occurredAt: string;
  reason: string | null;
  fromValue: Record<string, unknown>;
  toValue: Record<string, unknown>;
};

export type PregnancyFormInput = {
  practiceId: string;
  primaryProfessionalId: string;
  backupProfessionalId: string;
  lmpDate: string;
  clinicalEdd: string;
  pregnancyNumber: string;
  risk: "" | PregnancyRisk;
  careStartedOn: string;
  notes: string;
  changeReason: string;
};

export type PregnancyWriteContext = {
  patientId: string;
  organizationId: string;
};

export type PregnancyBackupGrant = {
  id: string;
  pregnancyId: string;
  principalProfessionalId: string;
  backupProfessionalId: string;
  grantedBy: string | null;
  grantedAt: string;
  revokedAt: string | null;
  revokedBy: string | null;
};

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

function isStatus(value: unknown): value is PregnancyStatus {
  return typeof value === "string" && (PREGNANCY_STATUSES as readonly string[]).includes(value);
}

function isRisk(value: unknown): value is PregnancyRisk {
  return typeof value === "string" && (PREGNANCY_RISKS as readonly string[]).includes(value);
}

function isEventKind(value: unknown): value is PregnancyEventKind {
  return typeof value === "string" && value in PREGNANCY_EVENT_LABEL;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function todayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function emptyPregnancyForm(partial?: Partial<PregnancyFormInput>): PregnancyFormInput {
  return {
    practiceId: "",
    primaryProfessionalId: "",
    backupProfessionalId: "",
    lmpDate: "",
    clinicalEdd: "",
    pregnancyNumber: "",
    risk: "",
    careStartedOn: todayIso(),
    notes: "",
    changeReason: "",
    ...partial,
  };
}

export function effectiveEdd(row: Pick<PregnancyRow, "clinicalEdd" | "calculatedEdd">) {
  return row.clinicalEdd ?? row.calculatedEdd;
}

export function pregnancyLabel(row: PregnancyRow) {
  if (row.pregnancyNumber) return `${row.pregnancyNumber}ª gestação`;
  const year = (row.careStartedOn ?? row.lmpDate ?? row.createdAt).slice(0, 4);
  return year ? `Gestação ${year}` : "Gestação";
}

function nestedName(value: unknown): string | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  return asTrimmed((row as Record<string, unknown>).name ?? (row as Record<string, unknown>).full_name);
}

function toPregnancyRow(
  value: Record<string, unknown>,
  names?: {
    practiceName?: string | null;
    primaryName?: string | null;
    backupName?: string | null;
    patientName?: string | null;
  },
): PregnancyRow | null {
  const id = asString(value.id);
  const organizationId = asString(value.organization_id);
  const practiceId = asString(value.practice_id);
  const patientId = asString(value.patient_id);
  const primaryProfessionalId = asString(value.primary_professional_id);
  const createdAt = asString(value.created_at);
  const updatedAt = asString(value.updated_at);
  const status = value.status;
  if (!id || !organizationId || !practiceId || !patientId || !primaryProfessionalId || !createdAt || !updatedAt) {
    return null;
  }
  if (!isStatus(status)) return null;
  return {
    id,
    organizationId,
    practiceId,
    patientId,
    primaryProfessionalId,
    backupProfessionalId: asString(value.backup_professional_id),
    lmpDate: asString(value.lmp_date),
    calculatedEdd: asString(value.calculated_edd),
    clinicalEdd: asString(value.clinical_edd),
    pregnancyNumber: asNumber(value.pregnancy_number),
    risk: isRisk(value.risk) ? value.risk : null,
    careStartedOn: asString(value.care_started_on),
    notes: asTrimmed(value.notes),
    status,
    statusReason: asTrimmed(value.status_reason),
    statusChangedAt: asString(value.status_changed_at),
    statusChangedBy: asString(value.status_changed_by),
    createdBy: asString(value.created_by),
    createdAt,
    updatedAt,
    practiceName: names?.practiceName ?? nestedName(value.practice_units),
    primaryName: names?.primaryName ?? null,
    backupName: names?.backupName ?? null,
    patientName: names?.patientName ?? nestedName(value.patients),
  };
}

function toEventRow(value: Record<string, unknown>): PregnancyEventRow | null {
  const id = asString(value.id);
  const pregnancyId = asString(value.pregnancy_id);
  const occurredAt = asString(value.occurred_at);
  const kind = value.kind;
  if (!id || !pregnancyId || !occurredAt || !isEventKind(kind)) return null;
  const fromValue =
    value.from_value && typeof value.from_value === "object" && !Array.isArray(value.from_value)
      ? (value.from_value as Record<string, unknown>)
      : {};
  const toValue =
    value.to_value && typeof value.to_value === "object" && !Array.isArray(value.to_value)
      ? (value.to_value as Record<string, unknown>)
      : {};
  return {
    id,
    pregnancyId,
    kind,
    actorId: asString(value.actor_id),
    occurredAt,
    reason: asTrimmed(value.reason),
    fromValue,
    toValue,
  };
}

function toProfessionalLabel(value: Record<string, unknown>): ProfessionalLabel | null {
  const id = asString(value.id);
  const practiceId = asString(value.practice_id);
  const organizationId = asString(value.organization_id);
  const fullName = asTrimmed(value.full_name);
  if (!id || !practiceId || !organizationId || !fullName) return null;
  return {
    id,
    practiceId,
    organizationId,
    fullName,
    councilType: asString(value.council_type) ?? "",
    councilNumber: asString(value.council_number) ?? "",
  };
}

function mapWriteError(error: { code?: string; message?: string }) {
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  if (error.code === "23505" || text.includes("pregnancies_one_in_care_per_patient")) {
    return "Esta paciente já possui uma gestação em acompanhamento. Encerre a atual antes de iniciar outra.";
  }
  if (text.includes("row-level security") || text.includes("42501") || text.includes("permission")) {
    return "A política de acesso do banco recusou esta operação.";
  }
  if (text.includes("motivo")) {
    return error.message ?? "Informe o motivo.";
  }
  if (text.includes("médica principal deve pertencer")) {
    return "A médica principal deve pertencer à prática selecionada.";
  }
  if (text.includes("encerrada") || text.includes("não pode ser alterada")) {
    return "Esta gestação não pode mais ser alterada.";
  }
  if (error.message) return error.message;
  return "Não foi possível salvar a gestação.";
}

function logError(scope: string, error: { code?: string; message?: string }) {
  console.error(`[pregnancies] ${scope} failed`, error.code ?? "", error.message ?? error);
}

async function loadLabels(
  supabase: SupabaseClient,
  rows: Array<Record<string, unknown>>,
): Promise<Map<string, string>> {
  const ids = new Set<string>();
  for (const row of rows) {
    const primary = asString(row.primary_professional_id);
    const backup = asString(row.backup_professional_id);
    if (primary) ids.add(primary);
    if (backup) ids.add(backup);
  }
  const names = new Map<string, string>();
  if (ids.size === 0) return names;
  const result = await supabase
    .from("professional_labels")
    .select("id, full_name")
    .in("id", [...ids]);
  if (result.error) {
    logError("labels", result.error);
    return names;
  }
  for (const item of result.data ?? []) {
    const id = asString((item as Record<string, unknown>).id);
    const name = asTrimmed((item as Record<string, unknown>).full_name);
    if (id && name) names.set(id, name);
  }
  return names;
}

function withNames(
  row: Record<string, unknown>,
  names: Map<string, string>,
  extra?: { patientName?: string | null },
): PregnancyRow | null {
  const parsed = toPregnancyRow(row, {
    primaryName: names.get(asString(row.primary_professional_id) ?? "") ?? null,
    backupName: names.get(asString(row.backup_professional_id) ?? "") ?? null,
    patientName: extra?.patientName ?? nestedName(row.patients),
  });
  return parsed;
}

export function pregnancyToForm(row: PregnancyRow): PregnancyFormInput {
  return {
    practiceId: row.practiceId,
    primaryProfessionalId: row.primaryProfessionalId,
    backupProfessionalId: row.backupProfessionalId ?? "",
    lmpDate: row.lmpDate ?? "",
    clinicalEdd: row.clinicalEdd ?? "",
    pregnancyNumber: row.pregnancyNumber != null ? String(row.pregnancyNumber) : "",
    risk: row.risk ?? "",
    careStartedOn: row.careStartedOn ?? "",
    notes: row.notes ?? "",
    changeReason: "",
  };
}

export function validatePregnancyForm(input: PregnancyFormInput): string | null {
  if (!input.practiceId) return "Selecione a prática.";
  if (!input.primaryProfessionalId) return "Selecione a médica principal.";
  if (input.backupProfessionalId && input.backupProfessionalId === input.primaryProfessionalId) {
    return "A médica de retaguarda deve ser diferente da principal.";
  }
  if (input.lmpDate) {
    const parsed = new Date(`${input.lmpDate}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return "Informe uma DUM válida.";
  }
  if (input.clinicalEdd) {
    const parsed = new Date(`${input.clinicalEdd}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return "Informe uma DPP ajustada válida.";
  }
  const numberText = input.pregnancyNumber.trim();
  if (numberText) {
    const parsed = Number(numberText);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return "O número da gestação deve ser um inteiro a partir de 1.";
    }
  }
  if (input.risk && !isRisk(input.risk)) return "Selecione a classificação de risco.";
  if (input.careStartedOn) {
    const parsed = new Date(`${input.careStartedOn}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return "Informe uma data de início válida.";
  }
  return null;
}

function toPersistPayload(input: PregnancyFormInput, context: PregnancyWriteContext) {
  const numberText = input.pregnancyNumber.trim();
  return {
    organization_id: context.organizationId,
    practice_id: input.practiceId,
    patient_id: context.patientId,
    primary_professional_id: input.primaryProfessionalId,
    backup_professional_id: optionalText(input.backupProfessionalId),
    lmp_date: optionalText(input.lmpDate),
    clinical_edd: optionalText(input.clinicalEdd),
    pregnancy_number: numberText ? Number(numberText) : null,
    risk: input.risk || null,
    care_started_on: optionalText(input.careStartedOn),
    notes: optionalText(input.notes),
    last_change_reason: optionalText(input.changeReason),
  };
}

export async function listProfessionalLabels(
  supabase: SupabaseClient,
  practiceId?: string,
): Promise<ProfessionalLabel[]> {
  let query = supabase
    .from("professional_labels")
    .select("id, practice_id, organization_id, council_type, council_number, full_name")
    .order("full_name");
  if (practiceId) query = query.eq("practice_id", practiceId);
  const result = await query;
  if (result.error) {
    logError("professionals", result.error);
    throw new Error("Não foi possível carregar as profissionais.");
  }
  return (result.data ?? []).flatMap((item) => {
    const row = toProfessionalLabel(item as Record<string, unknown>);
    return row ? [row] : [];
  });
}

export async function listPatientPregnancies(
  supabase: SupabaseClient,
  patientId: string,
): Promise<PregnancyRow[]> {
  const result = await supabase
    .from("pregnancies")
    .select(`${PREGNANCY_COLUMNS}, practice_units ( name )`)
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });
  if (result.error) {
    logError("list", result.error);
    throw new Error("Não foi possível carregar as gestações.");
  }
  const raw = (result.data ?? []) as Array<Record<string, unknown>>;
  const names = await loadLabels(supabase, raw);
  return raw.flatMap((item) => {
    const row = withNames(item, names);
    return row ? [row] : [];
  });
}

export async function listVisiblePregnancies(supabase: SupabaseClient): Promise<PregnancyRow[]> {
  const result = await supabase
    .from("pregnancies")
    .select(`${PREGNANCY_COLUMNS}, practice_units ( name ), patients ( full_name )`)
    .order("updated_at", { ascending: false })
    .limit(80);
  if (result.error) {
    logError("board", result.error);
    throw new Error("Não foi possível carregar as gestações.");
  }
  const raw = (result.data ?? []) as Array<Record<string, unknown>>;
  const names = await loadLabels(supabase, raw);
  return raw.flatMap((item) => {
    const row = withNames(item, names, { patientName: nestedName(item.patients) });
    return row ? [row] : [];
  });
}

export async function getPregnancy(
  supabase: SupabaseClient,
  pregnancyId: string,
): Promise<PregnancyRow | null> {
  const result = await supabase
    .from("pregnancies")
    .select(`${PREGNANCY_COLUMNS}, practice_units ( name ), patients ( full_name )`)
    .eq("id", pregnancyId)
    .maybeSingle();
  if (result.error) {
    logError("get", result.error);
    throw new Error("Não foi possível carregar a gestação.");
  }
  if (!result.data) return null;
  const raw = result.data as Record<string, unknown>;
  const names = await loadLabels(supabase, [raw]);
  return withNames(raw, names, { patientName: nestedName(raw.patients) });
}

export async function listPregnancyEvents(
  supabase: SupabaseClient,
  pregnancyId: string,
): Promise<PregnancyEventRow[]> {
  const result = await supabase
    .from("pregnancy_events")
    .select("id, pregnancy_id, kind, actor_id, occurred_at, reason, from_value, to_value")
    .eq("pregnancy_id", pregnancyId)
    .order("occurred_at", { ascending: false });
  if (result.error) {
    logError("events", result.error);
    throw new Error("Não foi possível carregar o histórico da gestação.");
  }
  return (result.data ?? []).flatMap((item) => {
    const row = toEventRow(item as Record<string, unknown>);
    return row ? [row] : [];
  });
}

export async function suggestPregnancyNumber(
  supabase: SupabaseClient,
  patientId: string,
): Promise<number> {
  const result = await supabase.from("pregnancies").select("id").eq("patient_id", patientId);
  if (result.error) return 1;
  return (result.data?.length ?? 0) + 1;
}

export async function createPregnancy(
  supabase: SupabaseClient,
  input: PregnancyFormInput,
  context: PregnancyWriteContext,
): Promise<PregnancyRow> {
  const validation = validatePregnancyForm(input);
  if (validation) throw new Error(validation);
  const result = await supabase
    .from("pregnancies")
    .insert(toPersistPayload(input, context))
    .select(PREGNANCY_COLUMNS)
    .single();
  if (result.error) {
    logError("create", result.error);
    throw new Error(mapWriteError(result.error));
  }
  const row = toPregnancyRow(result.data as Record<string, unknown>);
  if (!row) throw new Error("Gestação criada, mas a resposta do banco foi inválida.");
  return row;
}

export async function updatePregnancy(
  supabase: SupabaseClient,
  pregnancyId: string,
  input: PregnancyFormInput,
  context: PregnancyWriteContext,
): Promise<PregnancyRow> {
  const validation = validatePregnancyForm(input);
  if (validation) throw new Error(validation);
  const payload = toPersistPayload(input, context);
  const result = await supabase
    .from("pregnancies")
    .update({
      practice_id: payload.practice_id,
      primary_professional_id: payload.primary_professional_id,
      backup_professional_id: payload.backup_professional_id,
      lmp_date: payload.lmp_date,
      clinical_edd: payload.clinical_edd,
      pregnancy_number: payload.pregnancy_number,
      risk: payload.risk,
      care_started_on: payload.care_started_on,
      notes: payload.notes,
      last_change_reason: payload.last_change_reason,
    })
    .eq("id", pregnancyId)
    .select(PREGNANCY_COLUMNS)
    .single();
  if (result.error) {
    logError("update", result.error);
    throw new Error(mapWriteError(result.error));
  }
  const row = toPregnancyRow(result.data as Record<string, unknown>);
  if (!row) throw new Error("Gestação atualizada, mas a resposta do banco foi inválida.");
  return row;
}

export async function closePregnancy(
  supabase: SupabaseClient,
  pregnancyId: string,
  status: (typeof TERMINAL_PREGNANCY_STATUSES)[number],
  reason: string,
): Promise<void> {
  const trimmed = reason.trim();
  if (trimmed.length < 3) {
    throw new Error("Informe o motivo com pelo menos 3 caracteres.");
  }
  const result = await supabase
    .from("pregnancies")
    .update({ status, status_reason: trimmed })
    .eq("id", pregnancyId)
    .select("id")
    .single();
  if (result.error) {
    logError("close", result.error);
    throw new Error(mapWriteError(result.error));
  }
}

function toGrantRow(value: Record<string, unknown>): PregnancyBackupGrant | null {
  const id = asString(value.id);
  const pregnancyId = asString(value.pregnancy_id);
  const principalProfessionalId = asString(value.principal_professional_id);
  const backupProfessionalId = asString(value.backup_professional_id);
  const grantedAt = asString(value.granted_at);
  if (!id || !pregnancyId || !principalProfessionalId || !backupProfessionalId || !grantedAt) {
    return null;
  }
  return {
    id,
    pregnancyId,
    principalProfessionalId,
    backupProfessionalId,
    grantedBy: asString(value.granted_by),
    grantedAt,
    revokedAt: asString(value.revoked_at),
    revokedBy: asString(value.revoked_by),
  };
}

export async function listBackupGrants(
  supabase: SupabaseClient,
  pregnancyId: string,
): Promise<PregnancyBackupGrant[]> {
  const result = await supabase
    .from("pregnancy_backup_grants")
    .select(
      "id, pregnancy_id, principal_professional_id, backup_professional_id, granted_by, granted_at, revoked_at, revoked_by",
    )
    .eq("pregnancy_id", pregnancyId)
    .order("granted_at", { ascending: false });
  if (result.error) {
    logError("grants", result.error);
    return [];
  }
  return (result.data ?? []).flatMap((item) => {
    const row = toGrantRow(item as Record<string, unknown>);
    return row ? [row] : [];
  });
}

export function activeBackupGrant(grants: PregnancyBackupGrant[]) {
  return grants.find((item) => !item.revokedAt) ?? null;
}

export async function grantBackupAccess(supabase: SupabaseClient, pregnancyId: string) {
  const result = await supabase.rpc("grant_pregnancy_backup_access", { p_pregnancy: pregnancyId });
  if (result.error) {
    logError("grant", result.error);
    throw new Error(mapWriteError(result.error));
  }
}

export async function revokeBackupAccess(supabase: SupabaseClient, pregnancyId: string) {
  const result = await supabase.rpc("revoke_pregnancy_backup_access", { p_pregnancy: pregnancyId });
  if (result.error) {
    logError("revoke", result.error);
    throw new Error(mapWriteError(result.error));
  }
}

export function professionalNameFromMap(id: string | null | undefined, names: Map<string, string>) {
  if (!id) return null;
  return names.get(id) ?? null;
}

export function describePregnancyEvent(
  item: PregnancyEventRow,
  names: Map<string, string>,
  actorNames: Map<string, string>,
) {
  const fromId = asString(item.fromValue.primary_professional_id) ?? asString(item.fromValue.backup_professional_id);
  const toId = asString(item.toValue.primary_professional_id) ?? asString(item.toValue.backup_professional_id);
  const fromName = fromId ? names.get(fromId) : null;
  const toName = toId ? names.get(toId) : null;
  const actor = item.actorId ? actorNames.get(item.actorId) : null;
  const parts: string[] = [];
  if (fromName || toName) {
    parts.push(`${fromName ?? "—"} → ${toName ?? "—"}`);
  }
  if (actor) parts.push(`por ${actor}`);
  if (item.reason) parts.push(`Motivo: ${item.reason}`);
  return parts.join(". ");
}

export async function listProfileNames(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return names;
  const result = await supabase.from("profiles").select("id, full_name").in("id", unique);
  if (result.error) {
    logError("profiles", result.error);
    return names;
  }
  for (const item of result.data ?? []) {
    const id = asString((item as Record<string, unknown>).id);
    const name = asTrimmed((item as Record<string, unknown>).full_name);
    if (id && name) names.set(id, name);
  }
  return names;
}

export function collectEventProfessionalIds(events: PregnancyEventRow[]) {
  const ids: string[] = [];
  for (const item of events) {
    const values = [item.fromValue, item.toValue];
    for (const value of values) {
      const primary = asString(value.primary_professional_id);
      const backup = asString(value.backup_professional_id);
      if (primary) ids.push(primary);
      if (backup) ids.push(backup);
    }
  }
  return ids;
}

export function calculatedEddPreview(lmpDate: string) {
  return eddFromLmp(lmpDate);
}
