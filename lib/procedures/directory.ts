/** Persistência e RPC da Fase B2 — procedimentos de gestação + repasse. */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthorizationContext } from "@/lib/auth/authorization";
import {
  canManageProcedurePayout,
  canViewProcedurePayout,
} from "@/lib/auth/access";
import { parseReaisToCents } from "@/lib/policies/money";

export const OBSTETRIC_BIRTH_CODE = "OBSTETRIC_BIRTH";

export const PROCEDURE_CODE_LABEL: Record<string, string> = {
  OBSTETRIC_BIRTH: "Parto obstétrico",
};

export type PayoutStatus = "pending" | "settled" | "cancelled";

export const PAYOUT_STATUS_LABEL: Record<PayoutStatus, string> = {
  pending: "Pendente",
  settled: "Efetivado",
  cancelled: "Cancelado",
};

export type PregnancyProcedureRow = {
  id: string;
  organizationId: string;
  practiceId: string;
  pregnancyId: string;
  procedureId: string;
  procedureCode: string;
  performedByProfessionalId: string;
  performedAs: "principal" | "backup";
  backupGrantId: string | null;
  performedAt: string;
  notes: string | null;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  performerName: string | null;
};

export type PregnancyProcedurePayoutRow = {
  id: string;
  organizationId: string;
  practiceId: string;
  pregnancyId: string;
  pregnancyProcedureId: string;
  principalProfessionalId: string;
  backupProfessionalId: string;
  amountCents: number;
  status: PayoutStatus;
  effectiveOn: string | null;
  notes: string | null;
  cancelReason: string | null;
  createdBy: string;
  updatedBy: string | null;
  settledAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PayoutEventRow = {
  id: string;
  payoutId: string;
  kind: string;
  actorId: string | null;
  beforeStatus: string | null;
  afterStatus: string | null;
  beforeAmountCents: number | null;
  afterAmountCents: number | null;
  detail: Record<string, unknown>;
  occurredAt: string;
};

export type LedgerEntryRow = {
  id: string;
  payoutId: string;
  professionalId: string;
  counterpartyProfessionalId: string;
  direction: "outflow" | "inflow";
  effect: "post" | "reverse";
  amountCents: number;
  entryAt: string;
  note: string | null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toProcedureRow(
  value: Record<string, unknown>,
  performerName?: string | null,
): PregnancyProcedureRow | null {
  const id = asString(value.id);
  const organizationId = asString(value.organization_id);
  const practiceId = asString(value.practice_id);
  const pregnancyId = asString(value.pregnancy_id);
  const procedureId = asString(value.procedure_id);
  const procedureCode = asString(value.procedure_code);
  const performedBy = asString(value.performed_by_professional_id);
  const performedAs = asString(value.performed_as);
  const performedAt = asString(value.performed_at);
  const createdBy = asString(value.created_by);
  const createdAt = asString(value.created_at);
  const updatedAt = asString(value.updated_at);
  if (
    !id ||
    !organizationId ||
    !practiceId ||
    !pregnancyId ||
    !procedureId ||
    !procedureCode ||
    !performedBy ||
    (performedAs !== "principal" && performedAs !== "backup") ||
    !performedAt ||
    !createdBy ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }
  return {
    id,
    organizationId,
    practiceId,
    pregnancyId,
    procedureId,
    procedureCode,
    performedByProfessionalId: performedBy,
    performedAs,
    backupGrantId: asString(value.backup_grant_id),
    performedAt,
    notes: asString(value.notes),
    createdBy,
    updatedBy: asString(value.updated_by),
    createdAt,
    updatedAt,
    performerName: performerName ?? null,
  };
}

function toPayoutRow(value: Record<string, unknown>): PregnancyProcedurePayoutRow | null {
  const id = asString(value.id);
  const organizationId = asString(value.organization_id);
  const practiceId = asString(value.practice_id);
  const pregnancyId = asString(value.pregnancy_id);
  const pregnancyProcedureId = asString(value.pregnancy_procedure_id);
  const principal = asString(value.principal_professional_id);
  const backup = asString(value.backup_professional_id);
  const amountCents = asNumber(value.amount_cents);
  const status = asString(value.status);
  const createdBy = asString(value.created_by);
  const createdAt = asString(value.created_at);
  const updatedAt = asString(value.updated_at);
  if (
    !id ||
    !organizationId ||
    !practiceId ||
    !pregnancyId ||
    !pregnancyProcedureId ||
    !principal ||
    !backup ||
    amountCents == null ||
    (status !== "pending" && status !== "settled" && status !== "cancelled") ||
    !createdBy ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }
  return {
    id,
    organizationId,
    practiceId,
    pregnancyId,
    pregnancyProcedureId,
    principalProfessionalId: principal,
    backupProfessionalId: backup,
    amountCents,
    status,
    effectiveOn: asString(value.effective_on),
    notes: asString(value.notes),
    cancelReason: asString(value.cancel_reason),
    createdBy,
    updatedBy: asString(value.updated_by),
    settledAt: asString(value.settled_at),
    cancelledAt: asString(value.cancelled_at),
    createdAt,
    updatedAt,
  };
}

function mapRpcError(error: { message?: string } | null): string {
  const message = error?.message ?? "";
  if (message.includes("FORBIDDEN")) return "Sem permissão para esta operação.";
  if (message.includes("PAYOUT_NOT_ALLOWED_FOR_PRINCIPAL_PROCEDURE")) {
    return "Procedimento realizado pela médica principal não admite repasse.";
  }
  if (message.includes("ACTIVE_PAYOUT_EXISTS")) {
    return "Já existe um repasse ativo para este procedimento.";
  }
  if (message.includes("AMOUNT_LOCKED")) {
    return "Valor bloqueado após efetivação. Cancele e crie um novo repasse.";
  }
  if (message.includes("INVALID_STATUS_TRANSITION")) {
    return "Transição de status não permitida.";
  }
  if (message.includes("BACKUP_GRANT_REQUIRED")) {
    return "Retaguarda sem autorização vigente para registrar este procedimento.";
  }
  if (message.includes("PROCEDURE_CODE_UNKNOWN")) {
    return "Código de procedimento desconhecido.";
  }
  if (message.includes("INVALID_AMOUNT")) return "Informe um valor válido em reais.";
  if (message.includes("EFFECTIVE_ON_REQUIRED")) {
    return "Informe a data efetiva do repasse.";
  }
  if (message.includes("ALREADY_CANCELLED")) return "Este repasse já está cancelado.";
  if (message.includes("PAYOUT_CANCELLED")) return "Repasse cancelado não pode ser alterado.";
  if (message.includes("NOT_AUTHENTICATED")) return "Sessão expirada. Entre novamente.";
  return message || "Não foi possível concluir a operação.";
}

export function procedureLabel(code: string): string {
  return PROCEDURE_CODE_LABEL[code] ?? code;
}

export function canOfferPayoutForProcedure(row: PregnancyProcedureRow): boolean {
  return row.performedAs === "backup";
}

export function activePayout(
  payouts: PregnancyProcedurePayoutRow[],
  procedureId: string,
): PregnancyProcedurePayoutRow | null {
  return (
    payouts.find(
      (item) =>
        item.pregnancyProcedureId === procedureId &&
        (item.status === "pending" || item.status === "settled"),
    ) ?? null
  );
}

export async function listPregnancyProcedures(
  supabase: SupabaseClient,
  pregnancyId: string,
  nameByProfessionalId?: Map<string, string>,
): Promise<PregnancyProcedureRow[]> {
  const { data, error } = await supabase
    .from("pregnancy_procedures")
    .select("*")
    .eq("pregnancy_id", pregnancyId)
    .order("performed_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data
    .map((raw) => {
      const row = raw as Record<string, unknown>;
      const performerId = asString(row.performed_by_professional_id);
      return toProcedureRow(
        row,
        performerId ? nameByProfessionalId?.get(performerId) ?? null : null,
      );
    })
    .filter((item): item is PregnancyProcedureRow => Boolean(item));
}

export async function listPregnancyProcedurePayouts(
  supabase: SupabaseClient,
  pregnancyId: string,
): Promise<PregnancyProcedurePayoutRow[]> {
  const { data, error } = await supabase
    .from("pregnancy_procedure_payouts")
    .select("*")
    .eq("pregnancy_id", pregnancyId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data
    .map((raw) => toPayoutRow(raw as Record<string, unknown>))
    .filter((item): item is PregnancyProcedurePayoutRow => Boolean(item));
}

export async function listPayoutEvents(
  supabase: SupabaseClient,
  payoutId: string,
): Promise<PayoutEventRow[]> {
  const { data, error } = await supabase
    .from("pregnancy_procedure_payout_events")
    .select("*")
    .eq("payout_id", payoutId)
    .order("occurred_at", { ascending: false });
  if (error || !data) return [];
  return data
    .map((raw) => {
      const value = raw as Record<string, unknown>;
      const id = asString(value.id);
      const kind = asString(value.kind);
      const occurredAt = asString(value.occurred_at);
      if (!id || !kind || !occurredAt) return null;
      const detail =
        value.detail && typeof value.detail === "object" && !Array.isArray(value.detail)
          ? (value.detail as Record<string, unknown>)
          : {};
      return {
        id,
        payoutId,
        kind,
        actorId: asString(value.actor_id),
        beforeStatus: asString(value.before_status),
        afterStatus: asString(value.after_status),
        beforeAmountCents: asNumber(value.before_amount_cents),
        afterAmountCents: asNumber(value.after_amount_cents),
        detail,
        occurredAt,
      } satisfies PayoutEventRow;
    })
    .filter((item): item is PayoutEventRow => Boolean(item));
}

export async function listPayoutLedger(
  supabase: SupabaseClient,
  payoutId: string,
): Promise<LedgerEntryRow[]> {
  const { data, error } = await supabase
    .from("professional_payout_ledger_entries")
    .select("*")
    .eq("payout_id", payoutId)
    .order("entry_at", { ascending: true });
  if (error || !data) return [];
  return data
    .map((raw) => {
      const value = raw as Record<string, unknown>;
      const id = asString(value.id);
      const professionalId = asString(value.professional_id);
      const counterparty = asString(value.counterparty_professional_id);
      const direction = asString(value.direction);
      const effect = asString(value.effect);
      const amountCents = asNumber(value.amount_cents);
      const entryAt = asString(value.entry_at);
      if (
        !id ||
        !professionalId ||
        !counterparty ||
        (direction !== "outflow" && direction !== "inflow") ||
        (effect !== "post" && effect !== "reverse") ||
        amountCents == null ||
        !entryAt
      ) {
        return null;
      }
      return {
        id,
        payoutId,
        professionalId,
        counterpartyProfessionalId: counterparty,
        direction,
        effect,
        amountCents,
        entryAt,
        note: asString(value.note),
      } satisfies LedgerEntryRow;
    })
    .filter((item): item is LedgerEntryRow => Boolean(item));
}

export async function createPregnancyProcedure(
  supabase: SupabaseClient,
  input: {
    pregnancyId: string;
    procedureCode: string;
    performedByProfessionalId: string;
    performedAt: string;
    notes?: string;
  },
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("create_pregnancy_procedure", {
    p_pregnancy_id: input.pregnancyId,
    p_procedure_code: input.procedureCode,
    p_performed_by_professional_id: input.performedByProfessionalId,
    p_performed_at: input.performedAt,
    p_notes: input.notes ?? null,
  });
  if (error) return { id: null, error: mapRpcError(error) };
  return { id: typeof data === "string" ? data : null, error: null };
}

export async function createPregnancyProcedurePayout(
  supabase: SupabaseClient,
  input: {
    pregnancyProcedureId: string;
    amountReais: string;
    notes?: string;
    effectiveOn?: string;
  },
): Promise<{ id: string | null; error: string | null }> {
  const cents = parseReaisToCents(input.amountReais);
  if (cents == null) return { id: null, error: "Informe um valor válido em reais." };
  const { data, error } = await supabase.rpc("create_pregnancy_procedure_payout", {
    p_pregnancy_procedure_id: input.pregnancyProcedureId,
    p_amount_cents: cents,
    p_notes: input.notes ?? null,
    p_effective_on: input.effectiveOn || null,
  });
  if (error) return { id: null, error: mapRpcError(error) };
  return { id: typeof data === "string" ? data : null, error: null };
}

export async function updatePayoutNotes(
  supabase: SupabaseClient,
  payoutId: string,
  notes: string,
): Promise<string | null> {
  const { error } = await supabase.rpc("update_pregnancy_procedure_payout_notes", {
    p_payout_id: payoutId,
    p_notes: notes,
  });
  return error ? mapRpcError(error) : null;
}

export async function updatePayoutAmount(
  supabase: SupabaseClient,
  payoutId: string,
  amountReais: string,
): Promise<string | null> {
  const cents = parseReaisToCents(amountReais);
  if (cents == null) return "Informe um valor válido em reais.";
  const { error } = await supabase.rpc("update_pregnancy_procedure_payout_amount", {
    p_payout_id: payoutId,
    p_amount_cents: cents,
  });
  return error ? mapRpcError(error) : null;
}

export async function settlePayout(
  supabase: SupabaseClient,
  payoutId: string,
  effectiveOn: string,
): Promise<string | null> {
  const { error } = await supabase.rpc("settle_pregnancy_procedure_payout", {
    p_payout_id: payoutId,
    p_effective_on: effectiveOn,
  });
  return error ? mapRpcError(error) : null;
}

export async function cancelPayout(
  supabase: SupabaseClient,
  payoutId: string,
  reason: string,
): Promise<string | null> {
  const { error } = await supabase.rpc("cancel_pregnancy_procedure_payout", {
    p_payout_id: payoutId,
    p_reason: reason || null,
  });
  return error ? mapRpcError(error) : null;
}

/** UI: quem pode ver bloco de repasse nesta gestação. */
export function authCanViewPayoutsForPregnancy(
  auth: AuthorizationContext | null | undefined,
  practiceId: string,
  principalProfessionalId: string,
  backupProfessionalId: string | null,
): boolean {
  if (!auth) return false;
  return canViewProcedurePayout(
    auth,
    practiceId,
    principalProfessionalId,
    backupProfessionalId,
  );
}

export function authCanManagePayoutsForPregnancy(
  auth: AuthorizationContext | null | undefined,
  practiceId: string,
  principalProfessionalId: string,
): boolean {
  if (!auth) return false;
  return canManageProcedurePayout(auth, practiceId, principalProfessionalId);
}
