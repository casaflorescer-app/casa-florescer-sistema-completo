/**
 * Central de Relacionamentos (C036).
 * Separado do módulo clínico — sem SOAP/exames/orientações/receitas.
 * LGPD: segmentação sem dados de saúde nesta versão.
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
  | "no_upcoming";

export type OpportunityType =
  | "birthday"
  | "inactive_12m"
  | "no_upcoming"
  | "manual"
  | "patient_requested_contact"
  | "campaign_available"
  | "other";

export type OpportunityStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "CONTACTED"
  | "CONVERTED"
  | "DISMISSED"
  | "EXPIRED";

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
};

export type DashboardStats = {
  opportunitiesOpen: number;
  birthdayToday: number;
  inactive12m: number;
  campaignsDraft: number;
  campaignsReady: number;
  messagesPending: number;
  messagesSent: number;
  messagesFailed: number;
  optOuts: number;
  providerWhatsappConfigured: boolean;
  providerEmailConfigured: boolean;
  providerPushConfigured: boolean;
};

export const AUDIENCE_FILTER_LABEL: Record<AudienceFilter, string> = {
  manual: "Seleção manual",
  birthday_today: "Aniversário hoje",
  birthday_7d: "Aniversário nos próximos 7 dias",
  inactive_12m: "12 meses sem consulta",
  no_upcoming: "Sem novo agendamento",
};

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  DRAFT: "Rascunho",
  AUDIENCE_REVIEW: "Revisão de audiência",
  READY: "Pronta (envio não configurado)",
  QUEUED: "Na fila",
  PROCESSING: "Processando",
  COMPLETED: "Concluída",
  PARTIAL: "Parcial",
  FAILED: "Falhou",
  CANCELLED: "Cancelada",
};
