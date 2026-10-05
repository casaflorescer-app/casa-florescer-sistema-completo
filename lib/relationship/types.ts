/**
 * Central de Relacionamentos (C036/C037).
 * Separado do módulo clínico — sem SOAP/exames/orientações/receitas.
 * LGPD: segmentação sem dados de saúde.
 */

export type RelationshipChannel = "whatsapp" | "email" | "push";

export type CampaignPurpose = "relationship" | "campaign" | "administrative";

export type CampaignObjective =
  | "relationship"
  | "birthday"
  | "return"
  | "campaign"
  | "course"
  | "news"
  | "procedure_promo"
  | "administrative"
  | "event"
  | "institutional"
  | "other";

export type CampaignStatus =
  | "DRAFT"
  | "AUDIENCE_REVIEW"
  | "READY"
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETED"
  | "PARTIAL"
  | "FAILED"
  | "CANCELLED";

export type AudienceFilter =
  | "manual"
  | "birthday_today"
  | "birthday_7d"
  | "inactive_12m"
  | "no_upcoming"
  | "opportunity_pending"
  | "combined";

export type OpportunityType =
  | "birthday"
  | "inactive_12m"
  | "return_12_months"
  | "no_upcoming"
  | "no_future_appointment"
  | "manual"
  | "patient_requested_contact"
  | "campaign_available"
  | "campaign"
  | "procedure_promotion"
  | "event"
  | "payment_pending"
  | "contract_pending"
  | "other";

export type OpportunityStatus =
  | "NEW"
  | "PENDING"
  | "OPEN"
  | "IN_PROGRESS"
  | "CONTACTED"
  | "CONVERTED"
  | "DISMISSED"
  | "EXPIRED";

export type CombinedAudienceFilters = {
  birthday?: boolean;
  inactive_12m?: boolean;
  no_upcoming?: boolean;
  opportunity_pending?: boolean;
  preferred_channel?: RelationshipChannel | "";
  has_phone?: boolean;
  has_email?: boolean;
  opt_in?: boolean;
  opportunity_status?: OpportunityStatus | "";
};

export type CampaignTemplate = {
  id: string;
  organizationId: string;
  practiceId: string;
  name: string;
  purpose: string;
  channel: RelationshipChannel;
  subject: string | null;
  body: string;
  active: boolean;
};

export type Campaign = {
  id: string;
  organizationId: string;
  practiceId: string;
  name: string;
  objective: CampaignObjective;
  purpose: CampaignPurpose;
  channel: RelationshipChannel;
  templateId: string | null;
  status: CampaignStatus;
  audienceFilter: AudienceFilter | null;
  messageSubject: string | null;
  messageBody: string | null;
  audienceFrozenAt: string | null;
  createdAt: string;
};

export type CampaignAudienceRow = {
  campaignId: string;
  patientId: string;
  eligibilityStatus: "eligible" | "ineligible";
  exclusionReason: string | null;
  patientName?: string | null;
  phone?: string | null;
};

export type RelationshipOpportunity = {
  id: string;
  patientId: string | null;
  opportunityType: OpportunityType;
  title: string;
  description: string | null;
  priority: string;
  status: OpportunityStatus;
  dueAt: string | null;
  createdAt: string;
  patientName?: string | null;
  assigneeName?: string | null;
  phone?: string | null;
  preferredChannel?: string | null;
  lastAppointmentAt?: string | null;
  nextActionAt?: string | null;
};

export type ContactQueueRow = {
  opportunityId: string;
  patientId: string | null;
  patientName: string | null;
  phone: string | null;
  email: string | null;
  preferredChannel: string;
  opportunityType: OpportunityType;
  opportunityTitle: string;
  source: string;
  status: OpportunityStatus;
  priority: string;
  dueAt: string | null;
  nextActionAt: string | null;
  assigneeName: string | null;
  lastAppointmentAt: string | null;
  nextAppointmentAt: string | null;
  campaignOptOut: boolean;
};

export type DashboardStats = {
  opportunitiesOpen: number;
  opportunitiesNew: number;
  opportunitiesPending: number;
  birthdayToday: number;
  birthdayWeek: number;
  inactive12m: number;
  noUpcoming: number;
  campaignsDraft: number;
  campaignsReady: number;
  dispatchesPrepared: number;
  messagesPending: number;
  messagesSent: number;
  messagesFailed: number;
  optOuts: number;
  optOutsRecent: number;
  attentionFingerprint: string | null;
  attentionDismissed: boolean;
  providerWhatsappConfigured: boolean;
  providerEmailConfigured: boolean;
  providerPushConfigured: boolean;
};

export type PreviewMessageRow = {
  patientId: string;
  patientName: string;
  phone: string | null;
  channel: RelationshipChannel;
  eligibilityStatus: string;
  exclusionReason: string | null;
  renderedMessage: string;
};

export const AUDIENCE_FILTER_LABEL: Record<AudienceFilter, string> = {
  manual: "Seleção manual",
  birthday_today: "Aniversário hoje",
  birthday_7d: "Aniversário nos próximos 7 dias",
  inactive_12m: "12 meses sem consulta",
  no_upcoming: "Sem agendamento futuro",
  opportunity_pending: "Oportunidade pendente",
  combined: "Filtros combinados",
};

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  DRAFT: "Rascunho",
  AUDIENCE_REVIEW: "Revisão de audiência",
  READY: "Pronta (SIMULAÇÃO — NÃO ENVIADO)",
  QUEUED: "Na fila",
  PROCESSING: "Processando",
  COMPLETED: "Concluída",
  PARTIAL: "Parcial",
  FAILED: "Falhou",
  CANCELLED: "Cancelada",
};

export const OPPORTUNITY_TYPE_LABEL: Record<OpportunityType, string> = {
  birthday: "Aniversário",
  inactive_12m: "Retorno 12 meses",
  return_12_months: "Retorno 12 meses",
  no_upcoming: "Sem agendamento futuro",
  no_future_appointment: "Sem agendamento futuro",
  manual: "Manual",
  patient_requested_contact: "Solicitação da paciente",
  campaign_available: "Campanha disponível",
  campaign: "Campanha",
  procedure_promotion: "Divulgação de procedimento",
  event: "Evento",
  payment_pending: "Pagamento (estrutura)",
  contract_pending: "Contrato (estrutura)",
  other: "Outro",
};

export const OPEN_OPPORTUNITY_STATUSES: OpportunityStatus[] = [
  "NEW",
  "PENDING",
  "OPEN",
  "IN_PROGRESS",
];
