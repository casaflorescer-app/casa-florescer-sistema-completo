import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthorizationContext } from "@/lib/auth/authorization";
import { canManageProfessionalPolicy } from "@/lib/auth/access";
import { parseReaisToCents } from "@/lib/policies/money";
import { listProfessionalLabels, type ProfessionalLabel } from "@/lib/pregnancies/directory";

export type CarePolicyVersionRow = {
  id: string;
  policyId: string;
  professionalId: string;
  practiceId: string;
  organizationId: string;
  versionNumber: number;
  normalBirthCents: number;
  cesareanCents: number;
  requiresAvailabilityForPrenatal: boolean;
  allowsPrenatalException: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdBy: string | null;
  createdAt: string;
  professionalName: string | null;
  practiceName: string | null;
};

export type CarePolicyFormInput = {
  professionalId: string;
  practiceId: string;
  normalBirthReais: string;
  cesareanReais: string;
  requiresAvailabilityForPrenatal: "" | "yes" | "no";
  allowsPrenatalException: "" | "yes" | "no";
  effectiveFrom: string;
};

export type PublishCarePolicyInput = {
  professionalId: string;
  practiceId: string;
  normalBirthCents: number;
  cesareanCents: number;
  requiresAvailabilityForPrenatal: boolean;
  allowsPrenatalException: boolean;
  effectiveFrom: string;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function nestedName(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  return asString((value as { name?: unknown }).name);
}

function toVersionRow(
  value: Record<string, unknown>,
  extras?: { professionalName?: string | null; practiceName?: string | null },
): CarePolicyVersionRow | null {
  const id = asString(value.id) ?? asString(value.version_id);
  const policyId = asString(value.policy_id);
  const professionalId = asString(value.professional_id);
  const practiceId = asString(value.practice_id);
  const organizationId = asString(value.organization_id);
  const versionNumber = asNumber(value.version_number);
  const normalBirthCents = asNumber(value.normal_birth_cents);
  const cesareanCents = asNumber(value.cesarean_cents);
  const requires = asBoolean(value.requires_availability_for_prenatal);
  const allows = asBoolean(value.allows_prenatal_exception);
  const effectiveFrom = asString(value.effective_from);
  const createdAt = asString(value.created_at);
  if (
    !id ||
    !policyId ||
    !professionalId ||
    !practiceId ||
    !organizationId ||
    versionNumber == null ||
    normalBirthCents == null ||
    cesareanCents == null ||
    requires == null ||
    allows == null ||
    !effectiveFrom ||
    !createdAt
  ) {
    return null;
  }
  return {
    id,
    policyId,
    professionalId,
    practiceId,
    organizationId,
    versionNumber,
    normalBirthCents,
    cesareanCents,
    requiresAvailabilityForPrenatal: requires,
    allowsPrenatalException: allows,
    effectiveFrom,
    effectiveTo: asString(value.effective_to),
    createdBy: asString(value.created_by),
    createdAt,
    professionalName: extras?.professionalName ?? null,
    practiceName: extras?.practiceName ?? nestedName(value.practice_units),
  };
}

function mapWriteError(error: { message?: string; code?: string } | null): string {
  const message = error?.message ?? "";
  if (message.includes("Sem permissão")) return message;
  if (message.includes("não pertence")) return message;
  if (message.includes("duplicada")) return message;
  if (message.includes("histórica") || message.includes("já encerrada")) return message;
  if (message.includes("vigência")) return message;
  if (message.includes("centavos") || message.includes("monetários")) return message;
  if (message.toLowerCase().includes("row-level security") || error?.code === "42501") {
    return "A política de acesso do banco recusou esta operação.";
  }
  return message || "Não foi possível publicar a política.";
}

export function emptyCarePolicyForm(): CarePolicyFormInput {
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return {
    professionalId: "",
    practiceId: "",
    normalBirthReais: "",
    cesareanReais: "",
    requiresAvailabilityForPrenatal: "",
    allowsPrenatalException: "no",
    effectiveFrom: iso,
  };
}

export function versionToForm(row: CarePolicyVersionRow): CarePolicyFormInput {
  const whole = (cents: number) => {
    const w = Math.floor(cents / 100);
    const f = String(cents % 100).padStart(2, "0");
    return `${w},${f}`;
  };
  return {
    professionalId: row.professionalId,
    practiceId: row.practiceId,
    normalBirthReais: whole(row.normalBirthCents),
    cesareanReais: whole(row.cesareanCents),
    requiresAvailabilityForPrenatal: row.requiresAvailabilityForPrenatal ? "yes" : "no",
    allowsPrenatalException: row.allowsPrenatalException ? "yes" : "no",
    effectiveFrom: row.effectiveFrom,
  };
}

export function validateCarePolicyForm(input: CarePolicyFormInput): string | null {
  if (!input.professionalId) return "Selecione a profissional.";
  if (!input.practiceId) return "Selecione a prática.";
  const normal = parseReaisToCents(input.normalBirthReais);
  const cesarean = parseReaisToCents(input.cesareanReais);
  if (normal == null) return "Informe o valor padrão do parto normal em reais.";
  if (cesarean == null) return "Informe o valor padrão da cesariana em reais.";
  if (input.requiresAvailabilityForPrenatal !== "yes" && input.requiresAvailabilityForPrenatal !== "no") {
    return "Informe se a disponibilidade para parto é exigida no pré-natal.";
  }
  if (input.allowsPrenatalException !== "yes" && input.allowsPrenatalException !== "no") {
    return "Informe se a política admite exceção de pré-natal.";
  }
  if (input.requiresAvailabilityForPrenatal === "no" && input.allowsPrenatalException === "yes") {
    return "Exceção de pré-natal só se aplica quando a disponibilidade é exigida.";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) {
    return "Informe a data de início da vigência.";
  }
  return null;
}

export function formToPublishInput(input: CarePolicyFormInput): PublishCarePolicyInput {
  const error = validateCarePolicyForm(input);
  if (error) throw new Error(error);
  return {
    professionalId: input.professionalId,
    practiceId: input.practiceId,
    normalBirthCents: parseReaisToCents(input.normalBirthReais) as number,
    cesareanCents: parseReaisToCents(input.cesareanReais) as number,
    requiresAvailabilityForPrenatal: input.requiresAvailabilityForPrenatal === "yes",
    allowsPrenatalException:
      input.requiresAvailabilityForPrenatal === "yes" && input.allowsPrenatalException === "yes",
    effectiveFrom: input.effectiveFrom,
  };
}

export function selectableProfessionals(
  auth: AuthorizationContext,
  labels: ProfessionalLabel[],
): ProfessionalLabel[] {
  return labels.filter((item) => canManageProfessionalPolicy(auth, item.practiceId, item.id));
}

export function formatPolicyVigencia(row: Pick<CarePolicyVersionRow, "effectiveFrom" | "effectiveTo">) {
  const from = row.effectiveFrom.split("-").reverse().join("/");
  if (!row.effectiveTo) return `${from} — vigente`;
  const to = row.effectiveTo.split("-").reverse().join("/");
  return `${from} a ${to}`;
}

async function attachNames(
  supabase: SupabaseClient,
  rows: CarePolicyVersionRow[],
): Promise<CarePolicyVersionRow[]> {
  if (rows.length === 0) return rows;
  const labels = await listProfessionalLabels(supabase);
  const byId = new Map(labels.map((item) => [item.id, item]));
  const practiceIds = [...new Set(rows.map((item) => item.practiceId))];
  const practices = await supabase.from("practice_units").select("id, name").in("id", practiceIds);
  const practiceNames = new Map<string, string>();
  for (const item of practices.data ?? []) {
    const id = asString((item as { id?: unknown }).id);
    const name = asString((item as { name?: unknown }).name);
    if (id && name) practiceNames.set(id, name);
  }
  return rows.map((row) => ({
    ...row,
    professionalName: byId.get(row.professionalId)?.fullName ?? row.professionalName,
    practiceName: practiceNames.get(row.practiceId) ?? row.practiceName,
  }));
}

export async function listCurrentCarePolicies(
  supabase: SupabaseClient,
): Promise<CarePolicyVersionRow[]> {
  const result = await supabase
    .from("professional_care_policy_current")
    .select(
      "policy_id, version_id, professional_id, practice_id, organization_id, version_number, normal_birth_cents, cesarean_cents, requires_availability_for_prenatal, allows_prenatal_exception, effective_from, effective_to, created_by, created_at",
    )
    .order("effective_from", { ascending: false });
  if (result.error) {
    throw new Error("Não foi possível carregar as políticas.");
  }
  const rows = (result.data ?? []).flatMap((item) => {
    const raw = item as Record<string, unknown>;
    const mapped = toVersionRow({ ...raw, id: raw.version_id });
    return mapped ? [mapped] : [];
  });
  return attachNames(supabase, rows);
}

export async function listCarePolicyVersions(
  supabase: SupabaseClient,
  policyId: string,
): Promise<CarePolicyVersionRow[]> {
  const result = await supabase
    .from("professional_care_policy_versions")
    .select(
      "id, policy_id, professional_id, practice_id, organization_id, version_number, normal_birth_cents, cesarean_cents, requires_availability_for_prenatal, allows_prenatal_exception, effective_from, effective_to, created_by, created_at",
    )
    .eq("policy_id", policyId)
    .order("version_number", { ascending: false });
  if (result.error) {
    throw new Error("Não foi possível carregar o histórico da política.");
  }
  const rows = (result.data ?? []).flatMap((item) => {
    const mapped = toVersionRow(item as Record<string, unknown>);
    return mapped ? [mapped] : [];
  });
  return attachNames(supabase, rows);
}

export async function getCarePolicyById(
  supabase: SupabaseClient,
  policyId: string,
): Promise<{ current: CarePolicyVersionRow | null; versions: CarePolicyVersionRow[] }> {
  const versions = await listCarePolicyVersions(supabase, policyId);
  const current = versions.find((item) => item.effectiveTo == null) ?? null;
  return { current, versions };
}

export async function publishCarePolicyVersion(
  supabase: SupabaseClient,
  input: CarePolicyFormInput,
): Promise<string> {
  const payload = formToPublishInput(input);
  const result = await supabase.rpc("publish_professional_care_policy_version", {
    p_professional_id: payload.professionalId,
    p_practice_id: payload.practiceId,
    p_normal_birth_cents: payload.normalBirthCents,
    p_cesarean_cents: payload.cesareanCents,
    p_requires_availability_for_prenatal: payload.requiresAvailabilityForPrenatal,
    p_allows_prenatal_exception: payload.allowsPrenatalException,
    p_effective_from: payload.effectiveFrom,
  });
  if (result.error) {
    throw new Error(mapWriteError(result.error));
  }
  const id = asString(result.data);
  if (!id) throw new Error("A publicação não retornou a versão.");
  return id;
}
