import type { SupabaseClient } from "@supabase/supabase-js";
import { isCasaBrowserAuth } from "@/lib/auth/casa-mode";
import { cnpjDigits, isCnpjDigits, mapDbError } from "@/lib/platform/format";
import type { OrganizationRecord } from "@/lib/platform/types";

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function toOrganization(row: Record<string, unknown>): OrganizationRecord | null {
  const id = asString(row.id);
  const legalName = asString(row.legal_name);
  const tradeName = asString(row.trade_name);
  const cnpj = asString(row.cnpj);
  const createdAt = asString(row.created_at);
  if (!id || !legalName || !tradeName || !cnpj || !createdAt) return null;
  return { id, legalName, tradeName, cnpj, createdAt };
}

export async function listOrganizations(supabase: SupabaseClient | null) {
  if (!supabase) {
    if (!isCasaBrowserAuth()) return [];
    const { listOrganizationsCasa } = await import("@/lib/casa/reads");
    return (await listOrganizationsCasa()).flatMap((row) => {
      const item = toOrganization(row);
      return item ? [item] : [];
    });
  }
  const { data, error } = await supabase
    .from("organizations")
    .select("id, legal_name, trade_name, cnpj, created_at")
    .order("trade_name");
  if (error) throw new Error(mapDbError(error));
  return (data ?? []).flatMap((row) => {
    const item = toOrganization(row as Record<string, unknown>);
    return item ? [item] : [];
  });
}

export async function countOrganizations(supabase: SupabaseClient) {
  const { count, error } = await supabase
    .from("organizations")
    .select("id", { count: "exact", head: true });
  if (error) return null;
  return typeof count === "number" ? count : null;
}

export type OrganizationInput = {
  legalName: string;
  tradeName: string;
  cnpj: string;
};

export function validateOrganizationInput(input: OrganizationInput) {
  const legalName = input.legalName.trim();
  const tradeName = input.tradeName.trim();
  const cnpj = cnpjDigits(input.cnpj);
  if (!legalName) return "Informe a razão social.";
  if (!tradeName) return "Informe o nome fantasia.";
  if (!isCnpjDigits(cnpj)) return "Informe um CNPJ com exatamente 14 dígitos.";
  return null;
}

export async function createOrganization(supabase: SupabaseClient | null, input: OrganizationInput) {
  const message = validateOrganizationInput(input);
  if (message) throw new Error(message);
  if (!supabase) {
    if (!isCasaBrowserAuth()) throw new Error("Autenticação não configurada neste ambiente.");
    const { createOrganizationCasa } = await import("@/lib/casa/writes");
    try {
      const item = toOrganization(
        await createOrganizationCasa({
          legalName: input.legalName.trim(),
          tradeName: input.tradeName.trim(),
          cnpj: cnpjDigits(input.cnpj),
        }),
      );
      if (!item) throw new Error("Não foi possível ler a organização criada.");
      return item;
    } catch (err) {
      if (err instanceof Error && (err.message.startsWith("A política") || err.message.startsWith("Não foi possível"))) {
        throw err;
      }
      const code = typeof err === "object" && err && "code" in err ? String(err.code) : undefined;
      throw new Error(mapDbError({ code, message: err instanceof Error ? err.message : "" }));
    }
  }
  const { data, error } = await supabase
    .from("organizations")
    .insert({
      legal_name: input.legalName.trim(),
      trade_name: input.tradeName.trim(),
      cnpj: cnpjDigits(input.cnpj),
    })
    .select("id, legal_name, trade_name, cnpj, created_at")
    .single();
  if (error) throw new Error(mapDbError(error));
  const item = toOrganization(data as Record<string, unknown>);
  if (!item) throw new Error("Não foi possível ler a organização criada.");
  return item;
}

export async function updateOrganization(
  supabase: SupabaseClient | null,
  id: string,
  input: OrganizationInput,
) {
  const message = validateOrganizationInput(input);
  if (message) throw new Error(message);
  if (!supabase) {
    if (!isCasaBrowserAuth()) throw new Error("Autenticação não configurada neste ambiente.");
    const { updateOrganizationCasa } = await import("@/lib/casa/writes");
    try {
      const item = toOrganization(
        await updateOrganizationCasa(id, {
          legalName: input.legalName.trim(),
          tradeName: input.tradeName.trim(),
          cnpj: cnpjDigits(input.cnpj),
        }),
      );
      if (!item) throw new Error("Não foi possível ler a organização atualizada.");
      return item;
    } catch (err) {
      if (err instanceof Error && (err.message.startsWith("A política") || err.message.startsWith("Não foi possível"))) {
        throw err;
      }
      const code = typeof err === "object" && err && "code" in err ? String(err.code) : undefined;
      throw new Error(mapDbError({ code, message: err instanceof Error ? err.message : "" }));
    }
  }
  const { data, error } = await supabase
    .from("organizations")
    .update({
      legal_name: input.legalName.trim(),
      trade_name: input.tradeName.trim(),
      cnpj: cnpjDigits(input.cnpj),
    })
    .eq("id", id)
    .select("id, legal_name, trade_name, cnpj, created_at")
    .single();
  if (error) throw new Error(mapDbError(error));
  const item = toOrganization(data as Record<string, unknown>);
  if (!item) throw new Error("Não foi possível ler a organização atualizada.");
  return item;
}
