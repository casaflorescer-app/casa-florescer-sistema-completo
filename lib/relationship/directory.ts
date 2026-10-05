import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AudienceFilter,
  Campaign,
  CampaignAudienceRow,
  CampaignObjective,
  CampaignPurpose,
  CampaignStatus,
  CampaignTemplate,
  CombinedAudienceFilters,
  ContactQueueRow,
  DashboardStats,
  OpportunityStatus,
  PreviewMessageRow,
  RelationshipChannel,
  RelationshipOpportunity,
} from "@/lib/relationship/types";
import { OPEN_OPPORTUNITY_STATUSES } from "@/lib/relationship/types";
import { describeChannelAvailability } from "@/lib/relationship/providers";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function mapRelationshipRpcError(error: { message?: string } | null): string {
  const message = error?.message ?? "";
  if (message.includes("NOT_AUTHENTICATED")) return "Sessão expirada. Entre novamente.";
  if (message.includes("FORBIDDEN")) return "Você não possui acesso à Central de Relacionamentos.";
  if (message.includes("FILTER_CLINICAL_BLOCKED")) {
    return "Filtro clínico bloqueado (FILTER_CLINICAL_BLOCKED).";
  }
  if (message.includes("TEMPLATE_VARIABLE_INVALID")) {
    return "Variável de modelo inválida (TEMPLATE_VARIABLE_INVALID).";
  }
  if (message.includes("AUDIENCE_FROZEN")) return "A audiência desta campanha já está congelada.";
  if (message.includes("AUDIENCE_EMPTY")) return "Inclua ao menos uma paciente elegível.";
  if (message.includes("MESSAGE_REQUIRED")) return "Informe o texto da mensagem.";
  if (message.includes("CAMPAIGN_NOT_FOUND")) return "Campanha não encontrada.";
  if (message.includes("TEMPLATE_NOT_FOUND")) return "Modelo não encontrado.";
  if (message.includes("PROVIDER_NOT_CONFIGURED") || message.includes("ainda não configurado")) {
    return "Canal ainda não configurado. Nenhuma mensagem foi enviada.";
  }
  return message || "Não foi possível concluir a operação.";
}

function toTemplate(value: Record<string, unknown>): CampaignTemplate | null {
  const id = asString(value.id);
  const organizationId = asString(value.organization_id);
  const practiceId = asString(value.practice_id);
  const name = asString(value.name);
  const purpose = asString(value.purpose);
  const channel = asString(value.channel) as RelationshipChannel | null;
  const body = asString(value.body);
  if (!id || !organizationId || !practiceId || !name || !purpose || !channel || !body) return null;
  return {
    id,
    organizationId,
    practiceId,
    name,
    purpose,
    channel,
    subject: asString(value.subject),
    body,
    active: value.active !== false,
  };
}

function toCampaign(value: Record<string, unknown>): Campaign | null {
  const id = asString(value.id);
  const organizationId = asString(value.organization_id);
  const practiceId = asString(value.practice_id);
  const name = asString(value.name);
  const objective = asString(value.objective) as CampaignObjective | null;
  const purpose = asString(value.purpose) as CampaignPurpose | null;
  const channel = asString(value.channel) as RelationshipChannel | null;
  const status = asString(value.status) as CampaignStatus | null;
  const createdAt = asString(value.created_at);
  if (!id || !organizationId || !practiceId || !name || !objective || !purpose || !channel || !status || !createdAt) {
    return null;
  }
  return {
    id,
    organizationId,
    practiceId,
    name,
    objective,
    purpose,
    channel,
    templateId: asString(value.template_id),
    status,
    audienceFilter: asString(value.audience_filter) as AudienceFilter | null,
    messageSubject: asString(value.message_subject),
    messageBody: asString(value.message_body),
    audienceFrozenAt: asString(value.audience_frozen_at),
    createdAt,
  };
}

export async function fetchRelationshipDashboard(
  supabase: SupabaseClient,
  organizationId: string,
  practiceId: string,
): Promise<{ stats: DashboardStats | null; error: string | null }> {
  const { data, error } = await supabase.rpc("relationship_dashboard_stats", {
    p_organization_id: organizationId,
    p_practice_id: practiceId,
  });
  if (error) return { stats: null, error: mapRelationshipRpcError(error) };
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    stats: {
      opportunitiesOpen: Number(row.opportunities_open ?? 0),
      opportunitiesNew: Number(row.opportunities_new ?? 0),
      opportunitiesPending: Number(row.opportunities_pending ?? 0),
      birthdayToday: Number(row.birthday_today ?? 0),
      birthdayWeek: Number(row.birthday_week ?? 0),
      inactive12m: Number(row.inactive_12m ?? 0),
      noUpcoming: Number(row.no_upcoming ?? 0),
      campaignsDraft: Number(row.campaigns_draft ?? 0),
      campaignsReady: Number(row.campaigns_ready ?? 0),
      dispatchesPrepared: Number(row.dispatches_prepared ?? 0),
      messagesPending: Number(row.messages_pending ?? 0),
      messagesSent: Number(row.messages_sent ?? 0),
      messagesFailed: Number(row.messages_failed ?? 0),
      optOuts: Number(row.opt_outs ?? 0),
      optOutsRecent: Number(row.opt_outs_recent ?? 0),
      attentionFingerprint: asString(row.attention_fingerprint),
      attentionDismissed: Boolean(row.attention_dismissed),
      providerWhatsappConfigured: describeChannelAvailability("whatsapp").configured,
      providerEmailConfigured: describeChannelAvailability("email").configured,
      providerPushConfigured: describeChannelAvailability("push").configured,
    },
    error: null,
  };
}

export async function dismissRelationshipAttention(
  supabase: SupabaseClient,
  organizationId: string,
  practiceId: string,
  fingerprint: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("relationship_attention_dismiss", {
    p_organization_id: organizationId,
    p_practice_id: practiceId,
    p_fingerprint: fingerprint,
  });
  return { error: error ? mapRelationshipRpcError(error) : null };
}

export async function listCampaignTemplates(
  supabase: SupabaseClient,
  practiceId: string,
): Promise<CampaignTemplate[]> {
  const { data, error } = await supabase
    .from("campaign_templates")
    .select("id, organization_id, practice_id, name, purpose, channel, subject, body, active")
    .eq("practice_id", practiceId)
    .order("name");
  if (error || !data) return [];
  return data
    .map((row) => toTemplate(row as Record<string, unknown>))
    .filter((row): row is CampaignTemplate => Boolean(row));
}

export async function upsertCampaignTemplate(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<{ template: CampaignTemplate | null; error: string | null }> {
  const { data, error } = await supabase.rpc("campaign_template_upsert", { p_payload: payload });
  if (error) return { template: null, error: mapRelationshipRpcError(error) };
  return { template: toTemplate(data as Record<string, unknown>), error: null };
}

export async function listCampaigns(
  supabase: SupabaseClient,
  practiceId: string,
): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from("campaigns")
    .select(
      "id, organization_id, practice_id, name, objective, purpose, channel, template_id, status, audience_filter, message_subject, message_body, audience_frozen_at, created_at",
    )
    .eq("practice_id", practiceId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return data
    .map((row) => toCampaign(row as Record<string, unknown>))
    .filter((row): row is Campaign => Boolean(row));
}

export async function createCampaign(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<{ campaign: Campaign | null; error: string | null }> {
  const { data, error } = await supabase.rpc("campaign_create", { p_payload: payload });
  if (error) return { campaign: null, error: mapRelationshipRpcError(error) };
  return { campaign: toCampaign(data as Record<string, unknown>), error: null };
}

export async function updateCampaignDraft(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<{ campaign: Campaign | null; error: string | null }> {
  const { data, error } = await supabase.rpc("campaign_update_draft", { p_payload: payload });
  if (error) return { campaign: null, error: mapRelationshipRpcError(error) };
  return { campaign: toCampaign(data as Record<string, unknown>), error: null };
}

export async function duplicateCampaign(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<{ campaign: Campaign | null; error: string | null }> {
  const { data, error } = await supabase.rpc("campaign_duplicate", { p_campaign_id: campaignId });
  if (error) return { campaign: null, error: mapRelationshipRpcError(error) };
  return { campaign: toCampaign(data as Record<string, unknown>), error: null };
}

export async function buildCampaignAudience(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<{ summary: Record<string, unknown> | null; error: string | null }> {
  const { data, error } = await supabase.rpc("campaign_build_audience", { p_payload: payload });
  if (error) return { summary: null, error: mapRelationshipRpcError(error) };
  return { summary: (data ?? null) as Record<string, unknown> | null, error: null };
}

export async function mutateCampaignAudience(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("campaign_audience_mutate", { p_payload: payload });
  return { error: error ? mapRelationshipRpcError(error) : null };
}

export async function listCampaignAudience(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<CampaignAudienceRow[]> {
  const { data, error } = await supabase
    .from("campaign_audiences")
    .select("campaign_id, patient_id, eligibility_status, exclusion_reason")
    .eq("campaign_id", campaignId)
    .order("selected_at", { ascending: false });
  if (error || !data) return [];

  const patientIds = data.map((row) => row.patient_id as string);
  const { data: patients } = await supabase
    .from("patients")
    .select("id, full_name, phone")
    .in("id", patientIds.length ? patientIds : ["00000000-0000-0000-0000-000000000000"]);

  const byId = new Map(
    (patients ?? []).map((p) => [p.id as string, p as { id: string; full_name: string; phone: string | null }]),
  );

  return data.map((row) => {
    const patient = byId.get(row.patient_id as string);
    return {
      campaignId: row.campaign_id as string,
      patientId: row.patient_id as string,
      eligibilityStatus: row.eligibility_status as "eligible" | "ineligible",
      exclusionReason: (row.exclusion_reason as string | null) ?? null,
      patientName: patient?.full_name ?? null,
      phone: patient?.phone ?? null,
    };
  });
}

export async function confirmCampaignPrepare(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<{ result: Record<string, unknown> | null; error: string | null }> {
  const { data, error } = await supabase.rpc("campaign_confirm_prepare", {
    p_campaign_id: campaignId,
  });
  if (error) return { result: null, error: mapRelationshipRpcError(error) };
  return { result: (data ?? null) as Record<string, unknown> | null, error: null };
}

export async function cancelCampaign(
  supabase: SupabaseClient,
  campaignId: string,
  reason?: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("campaign_cancel", {
    p_campaign_id: campaignId,
    p_reason: reason ?? null,
  });
  return { error: error ? mapRelationshipRpcError(error) : null };
}

export async function checkCampaignOverlap(
  supabase: SupabaseClient,
  campaignId: string,
  days = 30,
): Promise<{ result: Record<string, unknown> | null; error: string | null }> {
  const { data, error } = await supabase.rpc("campaign_check_recent_overlap", {
    p_campaign_id: campaignId,
    p_days: days,
  });
  if (error) return { result: null, error: mapRelationshipRpcError(error) };
  return { result: (data ?? null) as Record<string, unknown> | null, error: null };
}

export async function previewCampaignMessage(
  supabase: SupabaseClient,
  campaignId: string,
  offset = 0,
): Promise<{ total: number; offset: number; row: PreviewMessageRow | null; error: string | null }> {
  const { data, error } = await supabase.rpc("campaign_preview_messages", {
    p_campaign_id: campaignId,
    p_offset: offset,
  });
  if (error) {
    return { total: 0, offset, row: null, error: mapRelationshipRpcError(error) };
  }
  const payload = (data ?? {}) as Record<string, unknown>;
  const rowRaw = payload.row as Record<string, unknown> | null;
  if (!rowRaw) {
    return { total: Number(payload.total ?? 0), offset: Number(payload.offset ?? offset), row: null, error: null };
  }
  return {
    total: Number(payload.total ?? 0),
    offset: Number(payload.offset ?? offset),
    row: {
      patientId: String(rowRaw.patient_id),
      patientName: String(rowRaw.patient_name ?? ""),
      phone: asString(rowRaw.phone),
      channel: String(rowRaw.channel) as RelationshipChannel,
      eligibilityStatus: String(rowRaw.eligibility_status ?? ""),
      exclusionReason: asString(rowRaw.exclusion_reason),
      renderedMessage: String(rowRaw.rendered_message ?? ""),
    },
    error: null,
  };
}

export async function refreshOpportunities(
  supabase: SupabaseClient,
  organizationId: string,
  practiceId: string,
): Promise<{ result: Record<string, unknown> | null; error: string | null }> {
  const { data, error } = await supabase.rpc("relationship_opportunities_refresh", {
    p_organization_id: organizationId,
    p_practice_id: practiceId,
  });
  if (error) return { result: null, error: mapRelationshipRpcError(error) };
  return { result: (data ?? null) as Record<string, unknown> | null, error: null };
}

export async function fetchContactQueue(
  supabase: SupabaseClient,
  organizationId: string,
  practiceId: string,
  filters: CombinedAudienceFilters = {},
  limit = 100,
  offset = 0,
): Promise<{ total: number; rows: ContactQueueRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc("relationship_contact_queue", {
    p_organization_id: organizationId,
    p_practice_id: practiceId,
    p_filters: filters,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) return { total: 0, rows: [], error: mapRelationshipRpcError(error) };
  const payload = (data ?? {}) as Record<string, unknown>;
  const rawRows = Array.isArray(payload.rows) ? payload.rows : [];
  const rows: ContactQueueRow[] = rawRows.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      opportunityId: String(row.opportunity_id),
      patientId: asString(row.patient_id),
      patientName: asString(row.patient_name),
      phone: asString(row.phone),
      email: asString(row.email),
      preferredChannel: String(row.preferred_channel ?? "whatsapp"),
      opportunityType: String(row.opportunity_type) as ContactQueueRow["opportunityType"],
      opportunityTitle: String(row.opportunity_title ?? ""),
      source: String(row.source ?? ""),
      status: String(row.status) as OpportunityStatus,
      priority: String(row.priority ?? "normal"),
      dueAt: asString(row.due_at),
      nextActionAt: asString(row.next_action_at),
      assigneeName: asString(row.assignee_name),
      lastAppointmentAt: asString(row.last_appointment_at),
      nextAppointmentAt: asString(row.next_appointment_at),
      campaignOptOut: Boolean(row.campaign_opt_out),
    };
  });
  return { total: Number(payload.total ?? rows.length), rows, error: null };
}

export async function listOpenOpportunities(
  supabase: SupabaseClient,
  practiceId: string,
): Promise<RelationshipOpportunity[]> {
  const { data, error } = await supabase
    .from("relationship_opportunities")
    .select(
      "id, patient_id, opportunity_type, title, description, priority, status, due_at, created_at, next_action_at, assigned_to",
    )
    .eq("practice_id", practiceId)
    .in("status", OPEN_OPPORTUNITY_STATUSES)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error || !data) return [];

  const patientIds = data.map((row) => row.patient_id).filter(Boolean) as string[];
  const assigneeIds = data.map((row) => row.assigned_to).filter(Boolean) as string[];
  const [{ data: patients }, { data: profiles }] = await Promise.all([
    supabase
      .from("patients")
      .select("id, full_name, phone")
      .in("id", patientIds.length ? patientIds : ["00000000-0000-0000-0000-000000000000"]),
    supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", assigneeIds.length ? assigneeIds : ["00000000-0000-0000-0000-000000000000"]),
  ]);
  const byId = new Map(
    (patients ?? []).map((p) => [
      p.id as string,
      { name: p.full_name as string, phone: (p.phone as string | null) ?? null },
    ]),
  );
  const assigneeById = new Map((profiles ?? []).map((p) => [p.id as string, p.full_name as string]));

  return data.map((row) => {
    const patient = row.patient_id ? byId.get(row.patient_id as string) : null;
    return {
      id: row.id as string,
      patientId: (row.patient_id as string | null) ?? null,
      opportunityType: row.opportunity_type as RelationshipOpportunity["opportunityType"],
      title: row.title as string,
      description: (row.description as string | null) ?? null,
      priority: row.priority as string,
      status: row.status as RelationshipOpportunity["status"],
      dueAt: (row.due_at as string | null) ?? null,
      createdAt: row.created_at as string,
      patientName: patient?.name ?? null,
      phone: patient?.phone ?? null,
      assigneeName: row.assigned_to ? assigneeById.get(row.assigned_to as string) ?? null : null,
      nextActionAt: (row.next_action_at as string | null) ?? null,
    };
  });
}

export async function setOpportunityStatus(
  supabase: SupabaseClient,
  opportunityId: string,
  status: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("relationship_opportunity_set_status", {
    p_opportunity_id: opportunityId,
    p_status: status,
  });
  return { error: error ? mapRelationshipRpcError(error) : null };
}

export async function createManualOpportunity(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("relationship_opportunity_create_manual", { p_payload: payload });
  return { error: error ? mapRelationshipRpcError(error) : null };
}

export async function upsertCommunicationPreferences(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("communication_preferences_upsert", { p_payload: payload });
  return { error: error ? mapRelationshipRpcError(error) : null };
}

export async function searchPatientsForAudience(
  supabase: SupabaseClient,
  organizationId: string,
  query: string,
): Promise<Array<{ id: string; fullName: string; phone: string | null }>> {
  const q = query.trim();
  let builder = supabase
    .from("patients")
    .select("id, full_name, phone")
    .eq("organization_id", organizationId)
    .order("full_name")
    .limit(30);
  if (q) {
    builder = builder.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`);
  }
  const { data, error } = await builder;
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id as string,
    fullName: row.full_name as string,
    phone: (row.phone as string | null) ?? null,
  }));
}

export async function listRelationshipHistory(
  supabase: SupabaseClient,
  practiceId: string,
  patientId?: string,
): Promise<Array<{ id: string; patientId: string; title: string; detail: string | null; createdAt: string; patientName?: string | null }>> {
  let builder = supabase
    .from("relationship_history")
    .select("id, patient_id, title, detail, created_at")
    .eq("practice_id", practiceId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (patientId) builder = builder.eq("patient_id", patientId);
  const { data, error } = await builder;
  if (error || !data) return [];
  const ids = data.map((r) => r.patient_id as string);
  const { data: patients } = await supabase
    .from("patients")
    .select("id, full_name")
    .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const byId = new Map((patients ?? []).map((p) => [p.id as string, p.full_name as string]));
  return data.map((row) => ({
    id: row.id as string,
    patientId: row.patient_id as string,
    title: row.title as string,
    detail: (row.detail as string | null) ?? null,
    createdAt: row.created_at as string,
    patientName: byId.get(row.patient_id as string) ?? null,
  }));
}

export function renderPreview(body: string, fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] || "paciente";
  return body
    .replaceAll("{{nome}}", fullName)
    .replaceAll("{{primeiro_nome}}", first)
    .replaceAll("{{nome_clinica}}", "Casa Florescer")
    .replaceAll("{{telefone_clinica}}", "")
    .replaceAll("{{link_agendamento}}", "")
    .replaceAll("{{data}}", new Date().toLocaleDateString("pt-BR"))
    .replaceAll("{{profissional}}", "");
}

export function summarizeIneligibleReasons(reasons: Record<string, unknown> | null | undefined): string {
  if (!reasons || typeof reasons !== "object") return "";
  const labels: Record<string, string> = {
    no_phone: "sem telefone",
    no_email: "sem e-mail",
    campaign_opt_out: "opt-out",
    whatsapp_disabled: "WhatsApp desabilitado",
    email_disabled: "e-mail desabilitado",
    push_disabled: "push desabilitado",
    admin_opt_out: "opt-out administrativo",
    patient_not_found: "paciente não encontrada",
  };
  return Object.entries(reasons)
    .map(([key, value]) => `${value} ${labels[key] ?? key}`)
    .join("; ");
}
