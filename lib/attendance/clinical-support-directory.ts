import type { SupabaseClient } from "@supabase/supabase-js";
import { isCasaBrowserAuth } from "@/lib/auth/casa-mode";
import { callCasaRpc } from "@/lib/casa/rpc";
import {
  listExamCatalogCasa,
  listExamGroupsCasa,
  listExamRequestItemsCasa,
  listExamRequestsCasa,
  listPrescriptionTemplateItemsCasa,
  listPrescriptionTemplatesCasa,
} from "@/lib/casa/module-data";
import type {
  ClinicalAiPayload,
  ClinicalSuggestionType,
} from "@/lib/ai/clinical-assistance-provider";

export type ExamCatalogRow = {
  id: string;
  practiceId: string;
  name: string;
  shortName: string | null;
  category: string | null;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
};

export type ExamGroupRow = {
  id: string;
  practiceId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  catalogIds: string[];
};

export type ExamRequestRow = {
  id: string;
  encounterId: string;
  patientId?: string | null;
  status: "draft" | "confirmed" | "cancelled";
  notes: string | null;
  clinicalIndication: string | null;
  confirmedAt: string | null;
  createdAt: string;
  items: Array<{
    id: string;
    catalogId: string | null;
    groupId: string | null;
    customName: string | null;
    catalogName: string | null;
    groupName: string | null;
  }>;
};

export type PrescriptionTemplateRow = {
  id: string;
  practiceId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  items: Array<{
    id: string;
    medicationName: string;
    presentation: string | null;
    concentration: string | null;
    dosage: string | null;
    route: string | null;
    frequency: string | null;
    duration: string | null;
    quantity: string | null;
    observations: string | null;
  }>;
};

export type AiAssistanceRequestRow = {
  id: string;
  suggestionType: ClinicalSuggestionType;
  status: string;
  provider: string | null;
  model: string | null;
  errorMessage: string | null;
  createdAt: string;
};

export type AiAssistanceResultRow = {
  id: string;
  requestId: string;
  version: number;
  isSimulation: boolean;
  payload: ClinicalAiPayload;
  reviewStatus: "pending" | "accepted" | "rejected" | "edited_accepted";
  reviewedPayload: ClinicalAiPayload | null;
  createdAt: string;
  reviewedAt: string | null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function mapRpcError(error: { message?: string } | null): string {
  const message = error?.message ?? "";
  if (message.includes("FORBIDDEN")) return "Sem permissão clínica para esta operação.";
  if (message.includes("ENCOUNTER_OWNER_REQUIRED")) return "Somente a profissional do atendimento.";
  if (message.includes("ENCOUNTER_NOT_OPEN")) return "Atendimento assinado — somente leitura.";
  if (message.includes("NOT_AUTHENTICATED")) return "Sessão expirada.";
  if (message.includes("EXAM_ITEMS_REQUIRED")) return "Selecione ao menos um exame.";
  if (message.includes("TEMPLATE_NOT_FOUND")) return "Modelo não encontrado.";
  if (message.includes("REQUEST_NOT_FOUND")) return "Solicitação não encontrada.";
  return message || "Não foi possível concluir a operação.";
}

export async function listExamCatalog(
  supabase: SupabaseClient | null,
  practiceId: string,
  activeOnly = true,
): Promise<ExamCatalogRow[]> {
  if (!supabase) {
    if (!isCasaBrowserAuth()) return [];
    return (await listExamCatalogCasa(practiceId, activeOnly)).flatMap((row) => {
      const id = asString(row.id);
      const practice = asString(row.practice_id);
      const name = asString(row.name);
      if (!id || !practice || !name) return [];
      return [{
        id,
        practiceId: practice,
        name,
        shortName: asString(row.short_name),
        category: asString(row.category),
        description: asString(row.description),
        isActive: Boolean(row.is_active),
        sortOrder: typeof row.sort_order === "number" ? row.sort_order : Number(row.sort_order ?? 100),
      }];
    });
  }
  let query = supabase
    .from("clinical_exam_catalog")
    .select("id, practice_id, name, short_name, category, description, is_active, sort_order")
    .eq("practice_id", practiceId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error || !data) return [];
  return data
    .map((row) => {
      const r = row as Record<string, unknown>;
      const id = asString(r.id);
      const practice = asString(r.practice_id);
      const name = asString(r.name);
      if (!id || !practice || !name) return null;
      return {
        id,
        practiceId: practice,
        name,
        shortName: asString(r.short_name),
        category: asString(r.category),
        description: asString(r.description),
        isActive: Boolean(r.is_active),
        sortOrder: typeof r.sort_order === "number" ? r.sort_order : 100,
      } satisfies ExamCatalogRow;
    })
    .filter((item): item is ExamCatalogRow => Boolean(item));
}

export async function listExamGroups(
  supabase: SupabaseClient | null,
  practiceId: string,
  activeOnly = true,
): Promise<ExamGroupRow[]> {
  if (!supabase) {
    if (!isCasaBrowserAuth()) return [];
    return (await listExamGroupsCasa(practiceId, activeOnly)).flatMap((row) => {
      const id = asString(row.id);
      const practice = asString(row.practice_id);
      const name = asString(row.name);
      if (!id || !practice || !name) return [];
      const catalogIds = Array.isArray(row.catalog_ids) ? row.catalog_ids.map(String) : [];
      return [{
        id,
        practiceId: practice,
        name,
        description: asString(row.description),
        isActive: Boolean(row.is_active),
        sortOrder: typeof row.sort_order === "number" ? row.sort_order : Number(row.sort_order ?? 100),
        catalogIds,
      }];
    });
  }
  let query = supabase
    .from("clinical_exam_groups")
    .select("id, practice_id, name, description, is_active, sort_order")
    .eq("practice_id", practiceId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error || !data) return [];

  const groups: ExamGroupRow[] = [];
  for (const row of data) {
    const r = row as Record<string, unknown>;
    const id = asString(r.id);
    const practice = asString(r.practice_id);
    const name = asString(r.name);
    if (!id || !practice || !name) continue;
    const { data: items } = await supabase
      .from("clinical_exam_group_items")
      .select("catalog_id")
      .eq("group_id", id)
      .order("sort_order", { ascending: true });
    groups.push({
      id,
      practiceId: practice,
      name,
      description: asString(r.description),
      isActive: Boolean(r.is_active),
      sortOrder: typeof r.sort_order === "number" ? r.sort_order : 100,
      catalogIds: (items ?? [])
        .map((item) => asString((item as Record<string, unknown>).catalog_id))
        .filter((x): x is string => Boolean(x)),
    });
  }
  return groups;
}

export async function upsertExamCatalog(
  supabase: SupabaseClient | null,
  input: {
    practiceId: string;
    name: string;
    id?: string;
    shortName?: string;
    category?: string;
    description?: string;
    isActive?: boolean;
    sortOrder?: number;
  },
): Promise<{ row: ExamCatalogRow | null; error: string | null }> {
  if (!supabase) {
    if (!isCasaBrowserAuth()) return { row: null, error: "Autenticação não configurada neste ambiente." };
    try {
      const data = await callCasaRpc("clinical_exam_catalog_upsert", [
        input.practiceId,
        input.name,
        input.id ?? null,
        input.shortName ?? null,
        input.category ?? null,
        input.description ?? null,
        input.isActive ?? true,
        input.sortOrder ?? 100,
      ]);
      const id = data && typeof data === "object" && "id" in data ? String((data as { id: unknown }).id) : "";
      const list = await listExamCatalog(null, input.practiceId, false);
      return { row: list.find((item) => item.id === id) ?? null, error: null };
    } catch (error) {
      return { row: null, error: error instanceof Error ? error.message : "Não foi possível gravar o exame." };
    }
  }
  const { data, error } = await supabase.rpc("clinical_exam_catalog_upsert", {
    p_practice_id: input.practiceId,
    p_name: input.name,
    p_id: input.id ?? null,
    p_short_name: input.shortName ?? null,
    p_category: input.category ?? null,
    p_description: input.description ?? null,
    p_is_active: input.isActive ?? true,
    p_sort_order: input.sortOrder ?? 100,
  });
  if (error || !data) return { row: null, error: mapRpcError(error) };
  const list = await listExamCatalog(supabase, input.practiceId, false);
  return { row: list.find((item) => item.id === (data as { id: string }).id) ?? null, error: null };
}

export async function upsertExamGroup(
  supabase: SupabaseClient | null,
  input: {
    practiceId: string;
    name: string;
    catalogIds: string[];
    id?: string;
    description?: string;
    isActive?: boolean;
    sortOrder?: number;
  },
): Promise<{ error: string | null }> {
  if (!supabase) {
    if (!isCasaBrowserAuth()) return { error: "Autenticação não configurada neste ambiente." };
    try {
      await callCasaRpc("clinical_exam_group_upsert", [
        input.practiceId,
        input.name,
        input.catalogIds,
        input.id ?? null,
        input.description ?? null,
        input.isActive ?? true,
        input.sortOrder ?? 100,
      ]);
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Não foi possível gravar o grupo." };
    }
  }
  const { error } = await supabase.rpc("clinical_exam_group_upsert", {
    p_practice_id: input.practiceId,
    p_name: input.name,
    p_catalog_ids: input.catalogIds,
    p_id: input.id ?? null,
    p_description: input.description ?? null,
    p_is_active: input.isActive ?? true,
    p_sort_order: input.sortOrder ?? 100,
  });
  return { error: error ? mapRpcError(error) : null };
}

export async function createExamRequest(
  supabase: SupabaseClient | null,
  input: {
    encounterId: string;
    catalogIds?: string[];
    groupIds?: string[];
    customNames?: string[];
    notes?: string;
    confirm?: boolean;
    clinicalIndication?: string | null;
  },
): Promise<{ id: string | null; error: string | null }> {
  const baseArgs = {
    p_encounter_id: input.encounterId,
    p_catalog_ids: input.catalogIds ?? [],
    p_group_ids: input.groupIds ?? [],
    p_custom_names: input.customNames ?? [],
    p_notes: input.notes ?? null,
    p_confirm: input.confirm ?? false,
  };
  // C040.9 / 0048: p_clinical_indication; fallback se remoto ainda for 0047
  if (!supabase) {
    if (!isCasaBrowserAuth()) return { id: null, error: "Autenticação não configurada neste ambiente." };
    try {
      const data = await callCasaRpc("clinical_exam_request_create", [
        input.encounterId,
        input.catalogIds ?? [],
        input.groupIds ?? [],
        input.customNames ?? [],
        input.notes ?? null,
        input.confirm ?? false,
        input.clinicalIndication ?? null,
      ]);
      const id =
        data && typeof data === "object" && "id" in data ? String((data as { id: unknown }).id) : null;
      return { id, error: null };
    } catch (error) {
      return { id: null, error: error instanceof Error ? error.message : "Não foi possível criar o pedido." };
    }
  }
  let { data, error } = await supabase.rpc("clinical_exam_request_create", {
    ...baseArgs,
    p_clinical_indication: input.clinicalIndication ?? null,
  });
  if (error && /clinical_exam_request_create|PGRST202|Could not find the function/i.test(error.message ?? "")) {
    ({ data, error } = await supabase.rpc("clinical_exam_request_create", baseArgs));
  }
  if (error || !data) return { id: null, error: mapRpcError(error) };
  return { id: asString((data as Record<string, unknown>).id), error: null };
}

export async function confirmExamRequest(
  supabase: SupabaseClient | null,
  requestId: string,
): Promise<{ error: string | null }> {
  if (!supabase) {
    if (!isCasaBrowserAuth()) return { error: "Autenticação não configurada neste ambiente." };
    try {
      await callCasaRpc("clinical_exam_request_confirm", [requestId]);
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Não foi possível confirmar o pedido." };
    }
  }
  const { error } = await supabase.rpc("clinical_exam_request_confirm", {
    p_request_id: requestId,
  });
  return { error: error ? mapRpcError(error) : null };
}

async function hydrateExamRequestRows(
  supabase: SupabaseClient,
  data: Record<string, unknown>[],
): Promise<ExamRequestRow[]> {
  const rows: ExamRequestRow[] = [];
  for (const r of data) {
    const id = asString(r.id);
    const enc = asString(r.encounter_id);
    const status = asString(r.status) as ExamRequestRow["status"] | null;
    const createdAt = asString(r.created_at);
    if (!id || !enc || !status || !createdAt) continue;

    const { data: items } = await supabase
      .from("clinical_exam_request_items")
      .select("id, catalog_id, group_id, custom_name")
      .eq("request_id", id)
      .order("sort_order", { ascending: true });

    const catalogIds = (items ?? [])
      .map((item) => asString((item as Record<string, unknown>).catalog_id))
      .filter((x): x is string => Boolean(x));
    const groupIds = (items ?? [])
      .map((item) => asString((item as Record<string, unknown>).group_id))
      .filter((x): x is string => Boolean(x));
    const nameById = new Map<string, string>();
    const groupNameById = new Map<string, string>();
    if (catalogIds.length > 0) {
      const { data: catalogs } = await supabase
        .from("clinical_exam_catalog")
        .select("id, name")
        .in("id", catalogIds);
      for (const catalog of catalogs ?? []) {
        const c = catalog as Record<string, unknown>;
        const cid = asString(c.id);
        const cname = asString(c.name);
        if (cid && cname) nameById.set(cid, cname);
      }
    }
    if (groupIds.length > 0) {
      const { data: groups } = await supabase
        .from("clinical_exam_groups")
        .select("id, name")
        .in("id", groupIds);
      for (const group of groups ?? []) {
        const g = group as Record<string, unknown>;
        const gid = asString(g.id);
        const gname = asString(g.name);
        if (gid && gname) groupNameById.set(gid, gname);
      }
    }

    rows.push({
      id,
      encounterId: enc,
      patientId: asString(r.patient_id),
      status,
      notes: asString(r.notes),
      clinicalIndication: asString(r.clinical_indication),
      confirmedAt: asString(r.confirmed_at),
      createdAt,
      items: (items ?? []).map((item) => {
        const i = item as Record<string, unknown>;
        const catalogId = asString(i.catalog_id);
        const groupId = asString(i.group_id);
        return {
          id: asString(i.id) ?? "",
          catalogId,
          groupId,
          customName: asString(i.custom_name),
          catalogName: catalogId ? nameById.get(catalogId) ?? null : null,
          groupName: groupId ? groupNameById.get(groupId) ?? null : null,
        };
      }),
    });
  }
  return rows;
}

function mapExamRequest(row: Record<string, unknown>, items: Record<string, unknown>[]): ExamRequestRow | null {
  const id = asString(row.id);
  const enc = asString(row.encounter_id);
  const status = asString(row.status) as ExamRequestRow["status"] | null;
  const createdAt = asString(row.created_at);
  if (!id || !enc || !status || !createdAt) return null;
  return {
    id,
    encounterId: enc,
    patientId: asString(row.patient_id),
    status,
    notes: asString(row.notes),
    clinicalIndication: asString(row.clinical_indication),
    confirmedAt: asString(row.confirmed_at),
    createdAt,
    items: items.map((item) => {
      const catalogId = asString(item.catalog_id);
      const groupId = asString(item.group_id);
      return {
        id: asString(item.id) ?? "",
        catalogId,
        groupId,
        customName: asString(item.custom_name),
        catalogName: asString(item.catalog_name),
        groupName: asString(item.group_name),
      };
    }),
  };
}

async function listExamRequestsCasaRows(input: { encounterId?: string; patientId?: string }) {
  const data = await listExamRequestsCasa(input);
  const items = await listExamRequestItemsCasa(data.map((row) => String(row.id)));
  return data.flatMap((row) => {
    const mapped = mapExamRequest(
      row,
      items.filter((item) => String(item.request_id) === String(row.id)),
    );
    return mapped ? [mapped] : [];
  });
}

export async function listExamRequestsForEncounter(
  supabase: SupabaseClient | null,
  encounterId: string,
): Promise<ExamRequestRow[]> {
  if (!supabase) {
    if (!isCasaBrowserAuth()) return [];
    return listExamRequestsCasaRows({ encounterId });
  }
  const { data, error } = await supabase
    .from("clinical_exam_requests")
    .select("id, encounter_id, patient_id, status, notes, clinical_indication, confirmed_at, created_at")
    .eq("encounter_id", encounterId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return hydrateExamRequestRows(supabase, data as Record<string, unknown>[]);
}

/** Pedidos clínicos do paciente (pedido ≠ resultado/anexo). */
export async function listExamRequestsForPatient(
  supabase: SupabaseClient | null,
  patientId: string,
): Promise<ExamRequestRow[]> {
  if (!supabase) {
    if (!isCasaBrowserAuth()) return [];
    return listExamRequestsCasaRows({ patientId });
  }
  const { data, error } = await supabase
    .from("clinical_exam_requests")
    .select("id, encounter_id, patient_id, status, notes, clinical_indication, confirmed_at, created_at")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return hydrateExamRequestRows(supabase, data as Record<string, unknown>[]);
}

export async function listPrescriptionTemplates(
  supabase: SupabaseClient | null,
  practiceId: string,
  activeOnly = true,
): Promise<PrescriptionTemplateRow[]> {
  if (!supabase) {
    if (!isCasaBrowserAuth()) return [];
    const data = await listPrescriptionTemplatesCasa(practiceId);
    const itemRows = await listPrescriptionTemplateItemsCasa(practiceId);
    return data.flatMap((row) => {
      if (activeOnly && row.is_active === false) return [];
      const id = asString(row.id);
      const practice = asString(row.practice_id);
      const name = asString(row.name);
      if (!id || !practice || !name) return [];
      return [{
        id,
        practiceId: practice,
        name,
        description: asString(row.description),
        isActive: Boolean(row.is_active),
        items: itemRows
          .filter((item) => String(item.template_id) === id)
          .map((item) => ({
            id: asString(item.id) ?? "",
            medicationName: asString(item.medication_name) ?? "",
            presentation: asString(item.presentation),
            concentration: asString(item.concentration),
            dosage: asString(item.dosage),
            route: asString(item.route),
            frequency: asString(item.frequency),
            duration: asString(item.duration),
            quantity: asString(item.quantity),
            observations: asString(item.observations),
          })),
      }];
    });
  }
  let query = supabase
    .from("prescription_templates")
    .select("id, practice_id, name, description, is_active")
    .eq("practice_id", practiceId)
    .order("name", { ascending: true });
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error || !data) return [];

  const rows: PrescriptionTemplateRow[] = [];
  for (const row of data) {
    const r = row as Record<string, unknown>;
    const id = asString(r.id);
    const practice = asString(r.practice_id);
    const name = asString(r.name);
    if (!id || !practice || !name) continue;
    const { data: items } = await supabase
      .from("prescription_template_items")
      .select(
        "id, medication_name, presentation, concentration, dosage, route, frequency, duration, quantity, observations",
      )
      .eq("template_id", id)
      .order("sort_order", { ascending: true });
    rows.push({
      id,
      practiceId: practice,
      name,
      description: asString(r.description),
      isActive: Boolean(r.is_active),
      items: (items ?? []).map((item) => {
        const i = item as Record<string, unknown>;
        return {
          id: asString(i.id) ?? "",
          medicationName: asString(i.medication_name) ?? "",
          presentation: asString(i.presentation),
          concentration: asString(i.concentration),
          dosage: asString(i.dosage),
          route: asString(i.route),
          frequency: asString(i.frequency),
          duration: asString(i.duration),
          quantity: asString(i.quantity),
          observations: asString(i.observations),
        };
      }),
    });
  }
  return rows;
}

export async function upsertPrescriptionTemplate(
  supabase: SupabaseClient | null,
  input: {
    practiceId: string;
    name: string;
    items: Array<Record<string, string | undefined>>;
    id?: string;
    description?: string;
    isActive?: boolean;
  },
): Promise<{ error: string | null }> {
  if (!supabase) {
    if (!isCasaBrowserAuth()) return { error: "Autenticação não configurada neste ambiente." };
    try {
      await callCasaRpc("prescription_template_upsert", [
        input.practiceId,
        input.name,
        input.items,
        input.id ?? null,
        input.description ?? null,
        input.isActive ?? true,
      ]);
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Não foi possível gravar o modelo." };
    }
  }
  const { error } = await supabase.rpc("prescription_template_upsert", {
    p_practice_id: input.practiceId,
    p_name: input.name,
    p_items: input.items,
    p_id: input.id ?? null,
    p_description: input.description ?? null,
    p_is_active: input.isActive ?? true,
  });
  return { error: error ? mapRpcError(error) : null };
}

export async function applyPrescriptionTemplate(
  supabase: SupabaseClient | null,
  templateId: string,
  encounterId: string,
): Promise<{ prescriptionId: string | null; error: string | null }> {
  if (!supabase) {
    if (!isCasaBrowserAuth()) return { prescriptionId: null, error: "Autenticação não configurada neste ambiente." };
    try {
      const data = await callCasaRpc("prescription_template_apply", [templateId, encounterId]);
      const id = data && typeof data === "object" && "id" in data ? String((data as { id: unknown }).id) : asString(data);
      return { prescriptionId: id, error: null };
    } catch (error) {
      return { prescriptionId: null, error: error instanceof Error ? error.message : "Não foi possível aplicar o modelo." };
    }
  }
  const { data, error } = await supabase.rpc("prescription_template_apply", {
    p_template_id: templateId,
    p_encounter_id: encounterId,
  });
  if (error || !data) return { prescriptionId: null, error: mapRpcError(error) };
  return { prescriptionId: asString((data as Record<string, unknown>).id), error: null };
}

export async function listAiAssistance(
  supabase: SupabaseClient | null,
  encounterId: string,
): Promise<{ requests: AiAssistanceRequestRow[]; results: AiAssistanceResultRow[]; error: string | null }> {
  if (!supabase) {
    if (!isCasaBrowserAuth()) return { requests: [], results: [], error: "Autenticação não configurada neste ambiente." };
    try {
      const data = await callCasaRpc("ai_assistance_list", [encounterId]);
      return mapAiList(data);
    } catch (error) {
      return { requests: [], results: [], error: error instanceof Error ? error.message : "Não foi possível listar o auxílio." };
    }
  }
  const { data, error } = await supabase.rpc("ai_assistance_list", {
    p_encounter_id: encounterId,
  });
  if (error || !data) {
    return { requests: [], results: [], error: mapRpcError(error) };
  }
  return mapAiList(data);
}

function mapAiList(data: unknown): { requests: AiAssistanceRequestRow[]; results: AiAssistanceResultRow[]; error: string | null } {
  const payload = (data && typeof data === "object" ? data : {}) as { requests?: unknown[]; results?: unknown[] };
  const requests = (payload.requests ?? [])
    .map((row) => {
      const r = row as Record<string, unknown>;
      const id = asString(r.id);
      const suggestionType = asString(r.suggestion_type) as ClinicalSuggestionType | null;
      const status = asString(r.status);
      const createdAt = asString(r.created_at);
      if (!id || !suggestionType || !status || !createdAt) return null;
      return {
        id,
        suggestionType,
        status,
        provider: asString(r.provider),
        model: asString(r.model),
        errorMessage: asString(r.error_message),
        createdAt,
      } satisfies AiAssistanceRequestRow;
    })
    .filter((item): item is AiAssistanceRequestRow => Boolean(item));

  const results = (payload.results ?? [])
    .map((row) => {
      const r = row as Record<string, unknown>;
      const id = asString(r.id);
      const requestId = asString(r.request_id);
      const createdAt = asString(r.created_at);
      const reviewStatus = asString(r.review_status) as AiAssistanceResultRow["reviewStatus"] | null;
      if (!id || !requestId || !createdAt || !reviewStatus) return null;
      const body = r.payload as ClinicalAiPayload;
      const reviewed = r.reviewed_payload as ClinicalAiPayload | null;
      return {
        id,
        requestId,
        version: typeof r.version === "number" ? r.version : 1,
        isSimulation: Boolean(r.is_simulation),
        payload: body,
        reviewStatus,
        reviewedPayload: reviewed,
        createdAt,
        reviewedAt: asString(r.reviewed_at),
      } satisfies AiAssistanceResultRow;
    })
    .filter((item): item is AiAssistanceResultRow => Boolean(item));

  return { requests, results, error: null };
}

export async function reviewAiAssistance(
  supabase: SupabaseClient | null,
  resultId: string,
  action: "accept" | "reject" | "edit_accept",
  reviewedPayload?: ClinicalAiPayload,
): Promise<{ error: string | null }> {
  if (!supabase) {
    if (!isCasaBrowserAuth()) return { error: "Autenticação não configurada neste ambiente." };
    try {
      await callCasaRpc("ai_assistance_review", [resultId, action, reviewedPayload ?? null]);
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Não foi possível revisar a sugestão." };
    }
  }
  const { error } = await supabase.rpc("ai_assistance_review", {
    p_result_id: resultId,
    p_action: action,
    p_reviewed_payload: reviewedPayload ?? null,
  });
  return { error: error ? mapRpcError(error) : null };
}
