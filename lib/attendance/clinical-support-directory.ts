import type { SupabaseClient } from "@supabase/supabase-js";
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
  supabase: SupabaseClient,
  practiceId: string,
  activeOnly = true,
): Promise<ExamCatalogRow[]> {
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
  supabase: SupabaseClient,
  practiceId: string,
  activeOnly = true,
): Promise<ExamGroupRow[]> {
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
  supabase: SupabaseClient,
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
  supabase: SupabaseClient,
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
  supabase: SupabaseClient,
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
  supabase: SupabaseClient,
  requestId: string,
): Promise<{ error: string | null }> {
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

export async function listExamRequestsForEncounter(
  supabase: SupabaseClient,
  encounterId: string,
): Promise<ExamRequestRow[]> {
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
  supabase: SupabaseClient,
  patientId: string,
): Promise<ExamRequestRow[]> {
  const { data, error } = await supabase
    .from("clinical_exam_requests")
    .select("id, encounter_id, patient_id, status, notes, clinical_indication, confirmed_at, created_at")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return hydrateExamRequestRows(supabase, data as Record<string, unknown>[]);
}

export async function listPrescriptionTemplates(
  supabase: SupabaseClient,
  practiceId: string,
  activeOnly = true,
): Promise<PrescriptionTemplateRow[]> {
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
  supabase: SupabaseClient,
  input: {
    practiceId: string;
    name: string;
    items: Array<Record<string, string | undefined>>;
    id?: string;
    description?: string;
    isActive?: boolean;
  },
): Promise<{ error: string | null }> {
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
  supabase: SupabaseClient,
  templateId: string,
  encounterId: string,
): Promise<{ prescriptionId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("prescription_template_apply", {
    p_template_id: templateId,
    p_encounter_id: encounterId,
  });
  if (error || !data) return { prescriptionId: null, error: mapRpcError(error) };
  return { prescriptionId: asString((data as Record<string, unknown>).id), error: null };
}

export async function listAiAssistance(
  supabase: SupabaseClient,
  encounterId: string,
): Promise<{ requests: AiAssistanceRequestRow[]; results: AiAssistanceResultRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc("ai_assistance_list", {
    p_encounter_id: encounterId,
  });
  if (error || !data) {
    return { requests: [], results: [], error: mapRpcError(error) };
  }
  const payload = data as { requests?: unknown[]; results?: unknown[] };
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
  supabase: SupabaseClient,
  resultId: string,
  action: "accept" | "reject" | "edit_accept",
  reviewedPayload?: ClinicalAiPayload,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("ai_assistance_review", {
    p_result_id: resultId,
    p_action: action,
    p_reviewed_payload: reviewedPayload ?? null,
  });
  return { error: error ? mapRpcError(error) : null };
}
