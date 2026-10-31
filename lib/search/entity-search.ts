/**
 * C070-C3 — buscas filtradas no banco para autocomplete (RLS/escopo do cliente).
 * Preferir estas helpers a carregar tabelas inteiras no navegador.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatIsoDateBr, formatPhone } from "@/lib/patients/format";
import {
  maskCpf,
  searchPatients,
  type PatientListRow,
} from "@/lib/patients/directory";
import type { ProfessionalLabel } from "@/lib/pregnancies/directory";
import { ITEM_CLASS_LABEL, type ItemClass } from "@/lib/inventory/types";

export type EntitySearchOption = {
  id: string;
  label: string;
  description?: string;
  keywords?: string;
};

function escapeIlike(raw: string): string {
  return raw.replace(/[%_\\]/g, "").trim();
}

function clampLimit(limit: number | undefined, fallback = 30): number {
  return Math.min(Math.max(limit ?? fallback, 1), 50);
}

export function patientToSearchOption(row: PatientListRow): EntitySearchOption {
  const bits = [
    row.birthDate ? `Nascimento: ${formatIsoDateBr(row.birthDate)}` : null,
    row.cpf ? `CPF: ${maskCpf(row.cpf)}` : null,
    row.phone ? `Telefone: ${formatPhone(row.phone)}` : null,
  ].filter(Boolean);
  return {
    id: row.id,
    label: row.fullName,
    description: bits.length > 0 ? bits.join(" · ") : undefined,
    keywords: [row.cpf, row.phone, row.email, row.socialName, row.birthDate]
      .filter(Boolean)
      .join(" "),
  };
}

export async function searchPatientOptions(
  supabase: SupabaseClient,
  query: string,
  options?: { limit?: number },
): Promise<EntitySearchOption[]> {
  const rows = await searchPatients(supabase, query, { limit: clampLimit(options?.limit) });
  return rows.map(patientToSearchOption);
}

export async function searchProfessionalOptions(
  supabase: SupabaseClient,
  query: string,
  options?: { practiceId?: string; organizationId?: string; limit?: number },
): Promise<EntitySearchOption[]> {
  const q = escapeIlike(query);
  if (q.length < 2) return [];
  const limit = clampLimit(options?.limit);
  function build(selectCols: string) {
    let b = supabase
      .from("professional_labels")
      .select(selectCols)
      .or(
        `full_name.ilike.%${q}%,council_number.ilike.%${q}%,council_type.ilike.%${q}%`,
      )
      .order("full_name")
      .limit(limit);
    if (options?.practiceId) b = b.eq("practice_id", options.practiceId);
    if (options?.organizationId) b = b.eq("organization_id", options.organizationId);
    return b;
  }

  let { data, error } = await build(
    "id, practice_id, organization_id, council_type, council_number, full_name, is_active",
  );
  // Compat: view pré-C074 sem is_active
  if (error && /is_active/i.test(error.message)) {
    ({ data, error } = await build(
      "id, practice_id, organization_id, council_type, council_number, full_name",
    ));
  }
  if (error) throw new Error("Não foi possível pesquisar profissionais.");
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return rows.flatMap((row) => {
    if (row.is_active === false) return [];
    const id = typeof row.id === "string" ? row.id : null;
    const fullName = typeof row.full_name === "string" ? row.full_name.trim() : "";
    if (!id || !fullName) return [];
    const councilType = typeof row.council_type === "string" ? row.council_type.trim() : "";
    const councilNumber =
      typeof row.council_number === "string" ? row.council_number.trim() : "";
    const council =
      councilType || councilNumber
        ? [councilType, councilNumber].filter(Boolean).join(" ")
        : "";
    return [
      {
        id,
        label: fullName,
        description: council || undefined,
        keywords: council,
      },
    ];
  });
}

/** Mantém ProfessionalLabel para salas/ocupação que ainda usam a lista completa pequena. */
export function professionalLabelToOption(row: ProfessionalLabel): EntitySearchOption {
  const council =
    row.councilType || row.councilNumber
      ? [row.councilType, row.councilNumber].filter(Boolean).join(" ")
      : "";
  return {
    id: row.id,
    label: row.fullName,
    description: council || undefined,
    keywords: council,
  };
}

export async function searchRoomOptions(
  supabase: SupabaseClient,
  query: string,
  options: { organizationId: string; activeOnly?: boolean; limit?: number },
): Promise<EntitySearchOption[]> {
  const q = escapeIlike(query);
  if (q.length < 1) return [];
  const limit = clampLimit(options.limit, 40);
  let builder = supabase
    .from("rooms")
    .select("id, name, code, room_kind, status")
    .eq("organization_id", options.organizationId)
    .or(`name.ilike.%${q}%,code.ilike.%${q}%,room_kind.ilike.%${q}%`)
    .order("name")
    .limit(limit);
  if (options.activeOnly !== false) builder = builder.eq("status", "active");
  const { data, error } = await builder;
  if (error) throw new Error("Não foi possível pesquisar salas.");
  return (data ?? []).flatMap((item) => {
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : null;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!id || !name) return [];
    const code = typeof row.code === "string" ? row.code.trim() : "";
    const kind = typeof row.room_kind === "string" ? row.room_kind.trim() : "";
    return [
      {
        id,
        label: name,
        description: [code, kind].filter(Boolean).join(" · ") || undefined,
        keywords: [code, kind].filter(Boolean).join(" "),
      },
    ];
  });
}

export async function searchProcedureOptions(
  supabase: SupabaseClient,
  query: string,
  options: {
    organizationId: string;
    practiceId?: string;
    limit?: number;
  },
): Promise<EntitySearchOption[]> {
  const q = escapeIlike(query);
  if (q.length < 2) return [];
  const limit = clampLimit(options.limit);
  const { data, error } = await supabase
    .from("procedures")
    .select("id, name, code, practice_id, is_shared, organization_id")
    .eq("organization_id", options.organizationId)
    .or(`name.ilike.%${q}%,code.ilike.%${q}%`)
    .order("name")
    .limit(Math.min(limit * 3, 80));
  if (error) throw new Error("Não foi possível pesquisar procedimentos.");
  return (data ?? [])
    .flatMap((item) => {
      const row = item as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id : null;
      const name = typeof row.name === "string" ? row.name.trim() : "";
      if (!id || !name) return [];
      const practiceId = typeof row.practice_id === "string" ? row.practice_id : null;
      const shared = row.is_shared === true;
      if (options.practiceId && practiceId !== options.practiceId && !shared) return [];
      const code = typeof row.code === "string" ? row.code.trim() : "";
      return [
        {
          id,
          label: name,
          description: code || undefined,
          keywords: code,
        },
      ];
    })
    .slice(0, limit);
}

export async function searchInventoryItemOptions(
  supabase: SupabaseClient,
  query: string,
  options: {
    organizationId: string;
    itemClass?: string;
    activeOnly?: boolean;
    limit?: number;
  },
): Promise<EntitySearchOption[]> {
  const q = escapeIlike(query);
  if (q.length < 2) return [];
  const limit = clampLimit(options.limit);
  let builder = supabase
    .from("items")
    .select("id, sku, name, item_class")
    .eq("organization_id", options.organizationId)
    .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
    .order("name")
    .limit(limit);
  if (options.activeOnly !== false) builder = builder.eq("is_active", true);
  if (options.itemClass && options.itemClass !== "all") {
    builder = builder.eq("item_class", options.itemClass);
  }
  const { data, error } = await builder;
  if (error) throw new Error("Não foi possível pesquisar itens de estoque.");
  return (data ?? []).flatMap((item) => {
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : null;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!id || !name) return [];
    const sku = typeof row.sku === "string" ? row.sku.trim() : "";
    const itemClass = typeof row.item_class === "string" ? row.item_class : "";
    const classLabel =
      itemClass && itemClass in ITEM_CLASS_LABEL
        ? ITEM_CLASS_LABEL[itemClass as ItemClass]
        : itemClass;
    return [
      {
        id,
        label: name,
        description: [sku, classLabel].filter(Boolean).join(" — ") || undefined,
        keywords: sku,
      },
    ];
  });
}

export async function searchLotOptions(
  supabase: SupabaseClient,
  query: string,
  options: { itemId?: string; warehouseId?: string; limit?: number },
): Promise<EntitySearchOption[]> {
  const q = escapeIlike(query);
  if (q.length < 1) return [];
  const limit = clampLimit(options.limit, 40);
  let builder = supabase
    .from("item_lots")
    .select("id, lot_code, expires_on, qty_on_hand, item_id, warehouse_id")
    .ilike("lot_code", `%${q}%`)
    .gt("qty_on_hand", 0)
    .order("expires_on", { ascending: true, nullsFirst: false })
    .limit(limit);
  if (options.itemId) builder = builder.eq("item_id", options.itemId);
  if (options.warehouseId) builder = builder.eq("warehouse_id", options.warehouseId);
  const { data, error } = await builder;
  if (error) throw new Error("Não foi possível pesquisar lotes.");
  return (data ?? []).flatMap((item) => {
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : null;
    const lotCode = typeof row.lot_code === "string" ? row.lot_code.trim() : "";
    if (!id || !lotCode) return [];
    const expires = typeof row.expires_on === "string" ? row.expires_on : null;
    const qty = typeof row.qty_on_hand === "number" ? row.qty_on_hand : Number(row.qty_on_hand ?? 0);
    return [
      {
        id,
        label: lotCode,
        description: [expires ? `Validade ${expires}` : null, `Qtd ${qty}`]
          .filter(Boolean)
          .join(" · "),
      },
    ];
  });
}

export async function searchWorkforceOptions(
  supabase: SupabaseClient,
  query: string,
  options: { organizationId: string; limit?: number },
): Promise<EntitySearchOption[]> {
  const q = escapeIlike(query);
  if (q.length < 2) return [];
  const limit = clampLimit(options.limit);
  const { data, error } = await supabase
    .from("clinic_workforce")
    .select("id, full_name, role_title, email, phone")
    .eq("organization_id", options.organizationId)
    .or(
      `full_name.ilike.%${q}%,role_title.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`,
    )
    .order("full_name")
    .limit(limit);
  if (error) throw new Error("Não foi possível pesquisar funcionários.");
  return (data ?? []).flatMap((item) => {
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : null;
    const fullName = typeof row.full_name === "string" ? row.full_name.trim() : "";
    if (!id || !fullName) return [];
    const role = typeof row.role_title === "string" ? row.role_title.trim() : "";
    const email = typeof row.email === "string" ? row.email.trim() : "";
    const phone = typeof row.phone === "string" ? row.phone.trim() : "";
    return [
      {
        id,
        label: fullName,
        description: [role, email || phone].filter(Boolean).join(" · ") || undefined,
        keywords: [role, email, phone].filter(Boolean).join(" "),
      },
    ];
  });
}

export async function searchRentalContractOptions(
  supabase: SupabaseClient,
  query: string,
  options: { organizationId: string; limit?: number },
): Promise<EntitySearchOption[]> {
  const q = escapeIlike(query);
  if (q.length < 2) return [];
  const limit = clampLimit(options.limit);
  const { data, error } = await supabase
    .from("rental_contracts")
    .select("id, contract_code, tenant_name, tenant_specialty, status")
    .eq("organization_id", options.organizationId)
    .or(
      `contract_code.ilike.%${q}%,tenant_name.ilike.%${q}%,tenant_specialty.ilike.%${q}%`,
    )
    .order("starts_on", { ascending: false })
    .limit(limit);
  if (error) throw new Error("Não foi possível pesquisar contratos.");
  return (data ?? []).flatMap((item) => {
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : null;
    const code = typeof row.contract_code === "string" ? row.contract_code.trim() : "";
    const tenant = typeof row.tenant_name === "string" ? row.tenant_name.trim() : "";
    if (!id) return [];
    const specialty =
      typeof row.tenant_specialty === "string" ? row.tenant_specialty.trim() : "";
    return [
      {
        id,
        label: tenant || code || id.slice(0, 8),
        description: [code, specialty, typeof row.status === "string" ? row.status : null]
          .filter(Boolean)
          .join(" · "),
      },
    ];
  });
}

export async function searchPregnancyOptions(
  supabase: SupabaseClient,
  query: string,
  options?: { limit?: number },
): Promise<EntitySearchOption[]> {
  const q = escapeIlike(query);
  if (q.length < 2) return [];
  const limit = clampLimit(options?.limit);
  // Busca por paciente vinculada (nome); DUM/DPP/status filtrados no cliente após join.
  const { data: patients, error: patientError } = await supabase
    .from("patients")
    .select("id, full_name")
    .ilike("full_name", `%${q}%`)
    .limit(limit);
  if (patientError) throw new Error("Não foi possível pesquisar gestações.");
  const patientIds = (patients ?? [])
    .map((p) => (p as { id?: string }).id)
    .filter((id): id is string => Boolean(id));
  if (patientIds.length === 0) {
    const { data, error } = await supabase
      .from("pregnancies")
      .select("id, patient_id, lmp_date, calculated_edd, clinical_edd, status, patients(full_name)")
      .ilike("status", `%${q}%`)
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return mapPregnancyHits(data ?? []);
  }
  const { data, error } = await supabase
    .from("pregnancies")
    .select("id, patient_id, lmp_date, calculated_edd, clinical_edd, status, patients(full_name)")
    .in("patient_id", patientIds)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error("Não foi possível pesquisar gestações.");
  return mapPregnancyHits(data ?? []);
}

function mapPregnancyHits(data: unknown[]): EntitySearchOption[] {
  return data.flatMap((item) => {
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : null;
    if (!id) return [];
    const patients = row.patients;
    const patientRec = Array.isArray(patients) ? patients[0] : patients;
    const patientName =
      patientRec && typeof (patientRec as { full_name?: unknown }).full_name === "string"
        ? String((patientRec as { full_name: string }).full_name).trim()
        : "Paciente";
    const status = typeof row.status === "string" ? row.status : "";
    const lmp = typeof row.lmp_date === "string" ? row.lmp_date : null;
    const edd =
      (typeof row.clinical_edd === "string" && row.clinical_edd) ||
      (typeof row.calculated_edd === "string" && row.calculated_edd) ||
      null;
    return [
      {
        id,
        label: patientName,
        description: [
          status ? `Status: ${status}` : null,
          lmp ? `DUM ${lmp}` : null,
          edd ? `DPP ${edd}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      },
    ];
  });
}
