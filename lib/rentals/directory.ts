"use client";

import { createClient } from "@/lib/supabase/client";
import {
  RENTAL_EXPIRING_SOON_DAYS,
  type CreateRentalContractInput,
  type RentalContractEventRow,
  type RentalContractRow,
  type RentalContractStatus,
  type RentalDashboardStats,
  type RentalDisplayStatus,
  type RentalRoomOption,
} from "@/lib/rentals/types";

function requireClient() {
  const supabase = createClient();
  if (!supabase) {
    throw new Error("Autenticação não configurada neste ambiente.");
  }
  return supabase;
}

export type RentalProfessionalOption = {
  id: string;
  fullName: string;
  specialty: string;
  council: string;
  practiceName: string | null;
  isActive: boolean;
};

type DbContract = {
  id: string;
  organization_id: string;
  room_id: string;
  tenant_professional_id: string | null;
  tenant_name: string;
  tenant_specialty: string;
  monthly_rent_cents: number;
  water_included: boolean;
  electricity_included: boolean;
  internet_included: boolean;
  starts_on: string;
  ends_on: string | null;
  status: RentalContractStatus;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  contract_code: string | null;
  renewed_from_id: string | null;
  created_by: string | null;
  updated_at: string | null;
  due_day: number | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  ended_at: string | null;
  end_reason: string | null;
  rooms?: { code?: string | null; name?: string | null } | null;
};

function oneRecord(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object" ? (first as Record<string, unknown>) : null;
  }
  if (value && typeof value === "object") return value as Record<string, unknown>;
  return null;
}

function mapContract(row: DbContract): RentalContractRow {
  return {
    id: row.id,
    organizationId: row.organization_id,
    roomId: row.room_id,
    tenantProfessionalId: row.tenant_professional_id,
    tenantName: row.tenant_name,
    tenantSpecialty: row.tenant_specialty,
    monthlyRentCents: Number(row.monthly_rent_cents ?? 0),
    waterIncluded: Boolean(row.water_included),
    electricityIncluded: Boolean(row.electricity_included),
    internetIncluded: Boolean(row.internet_included),
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    status: row.status,
    isActive: Boolean(row.is_active),
    notes: row.notes,
    createdAt: row.created_at,
    contractCode: row.contract_code,
    renewedFromId: row.renewed_from_id,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    dueDay: row.due_day,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    endedAt: row.ended_at,
    endReason: row.end_reason,
    roomName: row.rooms?.name ?? null,
    roomCode: row.rooms?.code ?? null,
  };
}

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function deriveDisplayStatus(
  contract: Pick<RentalContractRow, "status" | "endsOn">,
  today = new Date().toISOString().slice(0, 10),
  soonDays = RENTAL_EXPIRING_SOON_DAYS,
): RentalDisplayStatus {
  if (contract.status === "cancelled") return "cancelled";
  if (contract.status === "ended") return "ended";
  if (contract.status === "scheduled") return "scheduled";
  if (
    contract.status === "active" &&
    contract.endsOn &&
    contract.endsOn >= today &&
    contract.endsOn <= addDaysIso(today, soonDays)
  ) {
    return "expiring_soon";
  }
  return contract.status;
}

export function formatRentBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format((cents || 0) / 100);
}

export function parseRentToCents(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "").replace(/R\$/i, "").trim();
  if (!cleaned) return null;
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export function durationLabel(startsOn: string, endsOn: string | null): string {
  if (!endsOn) return "Indeterminado";
  const start = new Date(`${startsOn}T12:00:00`);
  const end = new Date(`${endsOn}T12:00:00`);
  const days = Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1,
  );
  if (days < 60) return `${days} dia(s)`;
  const months = Math.round(days / 30.4375);
  if (months < 24) return `~${months} mês(es)`;
  return `~${Math.round(months / 12)} ano(s)`;
}

const CONTRACT_SELECT = `
  id, organization_id, room_id, tenant_professional_id, tenant_name, tenant_specialty,
  monthly_rent_cents, water_included, electricity_included, internet_included,
  starts_on, ends_on, status, is_active, notes, created_at,
  contract_code, renewed_from_id, created_by, updated_at, due_day,
  cancelled_at, cancel_reason, ended_at, end_reason,
  rooms:room_id ( code, name )
`;

export type ListRentalContractsParams = {
  organizationId: string;
  search?: string;
  status?: RentalContractStatus | "expiring_soon" | "all";
  specialty?: string;
  roomId?: string;
  from?: string;
  to?: string;
  limit?: number;
};

export async function listRentalContracts(
  params: ListRentalContractsParams,
): Promise<RentalContractRow[]> {
  const supabase = requireClient();
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 300);
  let q = supabase
    .from("rental_contracts")
    .select(CONTRACT_SELECT)
    .eq("organization_id", params.organizationId)
    .order("starts_on", { ascending: false })
    .limit(limit);

  if (params.roomId) q = q.eq("room_id", params.roomId);
  if (params.specialty?.trim()) {
    q = q.ilike("tenant_specialty", `%${params.specialty.trim()}%`);
  }
  if (params.from) q = q.gte("starts_on", params.from);
  if (params.to) q = q.lte("starts_on", params.to);

  const statusFilter = params.status ?? "all";
  if (statusFilter === "expiring_soon") {
    const today = new Date().toISOString().slice(0, 10);
    const soon = addDaysIso(today, RENTAL_EXPIRING_SOON_DAYS);
    q = q
      .eq("status", "active")
      .not("ends_on", "is", null)
      .gte("ends_on", today)
      .lte("ends_on", soon);
  } else if (statusFilter !== "all") {
    q = q.eq("status", statusFilter);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  let rows = ((data ?? []) as DbContract[]).map(mapContract);
  const search = params.search?.trim().toLowerCase();
  if (search) {
    rows = rows.filter((r) => {
      const hay = [
        r.contractCode,
        r.tenantName,
        r.tenantSpecialty,
        r.roomName,
        r.roomCode,
        r.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(search);
    });
  }
  return rows;
}

export async function getRentalContract(
  organizationId: string,
  contractId: string,
): Promise<RentalContractRow | null> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from("rental_contracts")
    .select(CONTRACT_SELECT)
    .eq("organization_id", organizationId)
    .eq("id", contractId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapContract(data as DbContract);
}

export async function listRentalContractEvents(
  contractId: string,
): Promise<RentalContractEventRow[]> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from("rental_contract_events")
    .select("id, contract_id, event_kind, actor_id, detail, created_at")
    .eq("contract_id", contractId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    contractId: row.contract_id as string,
    eventKind: row.event_kind as string,
    actorId: (row.actor_id as string | null) ?? null,
    detail: (row.detail as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
  }));
}

export async function loadRentalDashboard(
  organizationId: string,
): Promise<RentalDashboardStats> {
  const supabase = requireClient();
  const today = new Date().toISOString().slice(0, 10);
  const soon = addDaysIso(today, RENTAL_EXPIRING_SOON_DAYS);

  const [contractsRes, roomsRes] = await Promise.all([
    supabase
      .from("rental_contracts")
      .select("id, status, ends_on, room_id")
      .eq("organization_id", organizationId),
    supabase
      .from("rooms")
      .select("id, room_kind")
      .eq("organization_id", organizationId)
      .eq("status", "active"),
  ]);

  if (contractsRes.error) throw new Error(contractsRes.error.message);
  if (roomsRes.error) throw new Error(roomsRes.error.message);

  const contracts = contractsRes.data ?? [];
  const rooms = roomsRes.data ?? [];
  const subletRooms = rooms.filter((r) => r.room_kind === "sublet_consultorio").length;
  const activeRoomIds = new Set(
    contracts
      .filter((c) => c.status === "active" || c.status === "scheduled")
      .map((c) => c.room_id as string),
  );

  return {
    active: contracts.filter((c) => c.status === "active").length,
    scheduled: contracts.filter((c) => c.status === "scheduled").length,
    expiringSoon: contracts.filter(
      (c) =>
        c.status === "active" &&
        c.ends_on &&
        (c.ends_on as string) >= today &&
        (c.ends_on as string) <= soon,
    ).length,
    ended: contracts.filter((c) => c.status === "ended").length,
    cancelled: contracts.filter((c) => c.status === "cancelled").length,
    subletRooms,
    roomsWithActiveContract: activeRoomIds.size,
  };
}

export async function listSubletRooms(
  organizationId: string,
): Promise<RentalRoomOption[]> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from("rooms")
    .select("id, code, name, room_kind")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .eq("room_kind", "sublet_consultorio")
    .order("code", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    code: r.code as string,
    name: r.name as string,
    roomKind: (r.room_kind as string | null) ?? null,
  }));
}

export async function listRentalProfessionals(
  organizationId: string,
): Promise<RentalProfessionalOption[]> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from("professionals")
    .select(
      "id, council_type, council_number, organization_id, profiles(full_name, is_active), practice_units(name, specialty)",
    )
    .eq("organization_id", organizationId)
    .limit(200);
  if (error) throw new Error(error.message);

  const rows = (data ?? []).flatMap((item) => {
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : null;
    if (!id) return [];
    const profile = oneRecord(record.profiles);
    const practice = oneRecord(record.practice_units);
    const fullName =
      typeof profile?.full_name === "string" ? profile.full_name.trim() : "";
    const specialty =
      typeof practice?.specialty === "string" ? practice.specialty.trim() : "";
    const practiceName =
      typeof practice?.name === "string" ? practice.name.trim() : null;
    const councilType =
      typeof record.council_type === "string" ? record.council_type.trim() : "";
    const councilNumber =
      typeof record.council_number === "string"
        ? record.council_number.trim()
        : "";
    const council = [councilType, councilNumber].filter(Boolean).join(" ") || "—";
    return [
      {
        id,
        fullName: fullName || "Profissional",
        specialty: specialty || "Não informada",
        council,
        practiceName,
        isActive: profile?.is_active !== false,
      },
    ];
  });
  rows.sort((a, b) => a.fullName.localeCompare(b.fullName, "pt-BR"));
  return rows;
}

export async function createRentalContract(
  input: CreateRentalContractInput,
): Promise<string> {
  const supabase = requireClient();
  const { data, error } = await supabase.rpc("rental_contract_create", {
    p_payload: {
      organization_id: input.organizationId,
      room_id: input.roomId,
      tenant_professional_id: input.tenantProfessionalId ?? null,
      tenant_name: input.tenantName,
      tenant_specialty: input.tenantSpecialty,
      monthly_rent_cents: input.monthlyRentCents,
      starts_on: input.startsOn,
      ends_on: input.endsOn ?? null,
      due_day: input.dueDay ?? null,
      notes: input.notes ?? null,
    },
  });
  if (error) throw new Error(mapRpcError(error.message));
  const row = data as { id?: string } | null;
  if (!row?.id) throw new Error("Contrato criado sem identificador retornado.");
  return row.id;
}

export async function updateRentalContract(params: {
  contractId: string;
  roomId?: string;
  tenantProfessionalId?: string | null;
  tenantName?: string;
  tenantSpecialty?: string;
  monthlyRentCents?: number;
  startsOn?: string;
  endsOn?: string | null;
  dueDay?: number | null;
  notes?: string | null;
}): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (params.roomId !== undefined) payload.room_id = params.roomId;
  if (params.tenantProfessionalId !== undefined) {
    payload.tenant_professional_id = params.tenantProfessionalId;
  }
  if (params.tenantName !== undefined) payload.tenant_name = params.tenantName;
  if (params.tenantSpecialty !== undefined) {
    payload.tenant_specialty = params.tenantSpecialty;
  }
  if (params.monthlyRentCents !== undefined) {
    payload.monthly_rent_cents = params.monthlyRentCents;
  }
  if (params.startsOn !== undefined) payload.starts_on = params.startsOn;
  if (params.endsOn !== undefined) payload.ends_on = params.endsOn;
  if (params.dueDay !== undefined) payload.due_day = params.dueDay;
  if (params.notes !== undefined) payload.notes = params.notes;

  const supabase = requireClient();
  const { error } = await supabase.rpc("rental_contract_update", {
    p_contract_id: params.contractId,
    p_payload: payload,
  });
  if (error) throw new Error(mapRpcError(error.message));
}

export async function endRentalContract(
  contractId: string,
  reason?: string | null,
): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.rpc("rental_contract_end", {
    p_contract_id: contractId,
    p_reason: reason ?? null,
  });
  if (error) throw new Error(mapRpcError(error.message));
}

export async function cancelRentalContract(
  contractId: string,
  reason: string,
): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.rpc("rental_contract_cancel", {
    p_contract_id: contractId,
    p_reason: reason,
  });
  if (error) throw new Error(mapRpcError(error.message));
}

export async function renewRentalContract(params: {
  contractId: string;
  startsOn: string;
  endsOn?: string | null;
  monthlyRentCents?: number | null;
}): Promise<string> {
  const supabase = requireClient();
  const { data, error } = await supabase.rpc("rental_contract_renew", {
    p_contract_id: params.contractId,
    p_starts_on: params.startsOn,
    p_ends_on: params.endsOn ?? null,
    p_monthly_rent_cents: params.monthlyRentCents ?? null,
  });
  if (error) throw new Error(mapRpcError(error.message));
  const row = data as { id?: string } | null;
  if (!row?.id) throw new Error("Renovação sem identificador retornado.");
  return row.id;
}

export function buildContractAlerts(
  contracts: RentalContractRow[],
): Array<{ id: string; severity: "warn" | "error"; message: string }> {
  const today = new Date().toISOString().slice(0, 10);
  const soon = addDaysIso(today, RENTAL_EXPIRING_SOON_DAYS);
  const seen = new Set<string>();
  const alerts: Array<{ id: string; severity: "warn" | "error"; message: string }> =
    [];

  const push = (id: string, severity: "warn" | "error", message: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    alerts.push({ id, severity, message });
  };

  for (const c of contracts) {
    const code = c.contractCode ?? c.id.slice(0, 8);
    if (c.status === "active" && c.endsOn && c.endsOn < today) {
      push(
        `expired:${c.id}`,
        "error",
        `Contrato ${code} vencido em ${c.endsOn} (status ainda ativo — sincronizar).`,
      );
    }
    if (
      c.status === "active" &&
      c.endsOn &&
      c.endsOn >= today &&
      c.endsOn <= soon
    ) {
      push(
        `expiring:${c.id}`,
        "warn",
        `Contrato ${code} próximo do vencimento (${c.endsOn}).`,
      );
    }
    if (
      (c.status === "active" || c.status === "scheduled") &&
      (!c.tenantName?.trim() || !c.tenantSpecialty?.trim() || !c.roomId)
    ) {
      push(
        `incomplete:${c.id}`,
        "warn",
        `Contrato ${code} com dados obrigatórios incompletos.`,
      );
    }
    if (
      c.status === "ended" &&
      c.endsOn &&
      c.endsOn >= today &&
      !c.renewedFromId
    ) {
      // Encerrado antes do término natural — sem renovação ainda registrada no próprio registro.
    }
    if (
      deriveDisplayStatus(c) === "expiring_soon" ||
      (c.status === "ended" &&
        c.endsOn &&
        c.endsOn < today &&
        c.endsOn >= addDaysIso(today, -14))
    ) {
      if (c.status === "ended") {
        push(
          `renew:${c.id}`,
          "warn",
          `Contrato ${code} encerrado recentemente — renovação pendente?`,
        );
      }
    }
  }

  // Conflitos: mesma sala com períodos overlapping (scheduled/active) — defesa UI
  const open = contracts.filter(
    (c) => c.status === "active" || c.status === "scheduled",
  );
  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) {
      const a = open[i];
      const b = open[j];
      if (a.roomId !== b.roomId) continue;
      const aEnd = a.endsOn ?? "9999-12-31";
      const bEnd = b.endsOn ?? "9999-12-31";
      if (a.startsOn <= bEnd && b.startsOn <= aEnd) {
        push(
          `overlap:${a.roomId}:${a.id}:${b.id}`,
          "error",
          `Conflito de sala: ${a.roomCode ?? a.roomId} com contratos sobrepostos.`,
        );
      }
    }
  }

  return alerts;
}

function mapRpcError(message: string): string {
  if (
    message.includes("RENTAL_CONTRACT_ROOM_OVERLAP") ||
    message.includes("exclusion") ||
    message.includes("rental_contracts_room_no_overlap") ||
    message.includes("rental_contracts_one_active_per_room") ||
    message.includes("one_active_per_room")
  ) {
    return "Conflito de sala: já existe contrato ativo/futuro nesta sala (máx. 1 scheduled/active por sala).";
  }
  if (
    message.includes("sublet_consultorio") ||
    message.includes("RENTAL_CONTRACT_ROOM_NOT_SUBLET")
  ) {
    return "Somente salas do tipo consultório de aluguel (sublet) aceitam contrato.";
  }
  if (
    message.includes("RENTAL_CONTRACT_INVALID_RANGE") ||
    message.includes("RENTAL_CONTRACT_DATES_INVALID")
  ) {
    return "Datas inválidas: o término deve ser igual ou posterior ao início.";
  }
  if (
    message.includes("RENTAL_CONTRACT_INVALID_VALUE") ||
    message.includes("RENTAL_CONTRACT_RENT_INVALID")
  ) {
    return "Informe um valor de aluguel válido (≥ R$ 0,00).";
  }
  if (
    message.includes("RENTAL_CONTRACT_TENANT_REQUIRED") ||
    message.includes("RENTAL_CONTRACT_SPECIALTY_REQUIRED")
  ) {
    return "Informe o profissional (nome) e a especialidade.";
  }
  if (message.includes("RENTAL_CONTRACT_REQUIRED_FIELDS")) {
    return "Preencha organização, sala, início e valor do aluguel.";
  }
  if (message.includes("RENTAL_CONTRACT_TERMINAL") || message.includes("IMMUTABLE")) {
    return "Contratos encerrados ou cancelados não podem ser editados.";
  }
  if (message.includes("RENTAL_CONTRACT_NOT_FOUND") || message.includes("NOT_FOUND")) {
    return "Contrato ou sala não encontrado nesta organização.";
  }
  if (message.includes("RENTAL_CONTRACT_CANCEL_REASON_REQUIRED")) {
    return "Informe o motivo do cancelamento.";
  }
  if (message.includes("FORBIDDEN")) {
    return "Sem permissão para esta operação (owner/admin).";
  }
  if (message.includes("outra organização")) {
    return "Profissional de outra organização — acesso negado.";
  }
  return message;
}
