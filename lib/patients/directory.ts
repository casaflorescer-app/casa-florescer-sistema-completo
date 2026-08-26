import type { SupabaseClient } from "@supabase/supabase-js";
import { onlyDigits } from "@/lib/patients/format";

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

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function mapListError(error: { code?: string; message?: string }): string {
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  if (
    error.code === "42501" ||
    text.includes("row-level security") ||
    text.includes("permission denied") ||
    text.includes("not authorized") ||
    text.includes("rls")
  ) {
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
    console.error("[patients] list failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(mapListError(error));
  }

  return (data ?? []).flatMap((item) => {
    const row = toRow(item as Record<string, unknown>);
    return row ? [row] : [];
  });
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
