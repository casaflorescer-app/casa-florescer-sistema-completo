export type ClinicSpecialty = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  professionalCount?: number;
};

export type WorkforceEngagement = "employee" | "contractor" | "other";
export type WorkforceStatus = "active" | "inactive";

export type ClinicWorkforceMember = {
  id: string;
  organizationId: string;
  fullName: string;
  documentCpf: string | null;
  phone: string | null;
  email: string | null;
  roleTitle: string;
  engagementKind: WorkforceEngagement;
  status: WorkforceStatus;
  startsOn: string | null;
  endsOn: string | null;
  notes: string | null;
  createdAt: string;
};

export type ObstetricContractStatus = "draft" | "active" | "ended" | "cancelled";

export type ObstetricAvailabilityContract = {
  id: string;
  organizationId: string;
  practiceId: string | null;
  patientId: string;
  patientName: string | null;
  professionalId: string;
  professionalName: string | null;
  contractCode: string | null;
  status: ObstetricContractStatus;
  contractedOn: string;
  startsOn: string | null;
  endsOn: string | null;
  includesNormalBirth: boolean;
  includesCesarean: boolean;
  notes: string | null;
  createdAt: string;
};

export type ProcedureAgreementKind = "procedure_contract" | "risk_acknowledgment" | "other";
export type ProcedureAgreementStatus = "draft" | "active" | "superseded" | "cancelled";

export type ProcedureAgreement = {
  id: string;
  organizationId: string;
  patientId: string;
  patientName: string | null;
  professionalId: string | null;
  professionalName: string | null;
  encounterId: string | null;
  procedureName: string;
  agreementKind: ProcedureAgreementKind;
  status: ProcedureAgreementStatus;
  versionNumber: number;
  title: string;
  termBody: string | null;
  acknowledgedAt: string | null;
  acknowledgedByName: string | null;
  notes: string | null;
  createdAt: string;
};

export type RoomAdminRow = {
  id: string;
  code: string;
  name: string;
  roomKind: string | null;
  isHouse: boolean;
  status: string;
  sortOrder: number;
  occupantProfessionalId: string | null;
  holderName: string | null;
};

export const ENGAGEMENT_LABEL: Record<WorkforceEngagement, string> = {
  employee: "Funcionário",
  contractor: "Prestador",
  other: "Outro",
};

export const WORKFORCE_STATUS_LABEL: Record<WorkforceStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
};

export const OBS_STATUS_LABEL: Record<ObstetricContractStatus, string> = {
  draft: "Rascunho",
  active: "Ativo",
  ended: "Encerrado",
  cancelled: "Cancelado",
};

export const PROC_KIND_LABEL: Record<ProcedureAgreementKind, string> = {
  procedure_contract: "Contrato de procedimento",
  risk_acknowledgment: "Termo de ciência dos riscos",
  other: "Outro",
};

export const PROC_STATUS_LABEL: Record<ProcedureAgreementStatus, string> = {
  draft: "Rascunho",
  active: "Ativo",
  superseded: "Substituído",
  cancelled: "Cancelado",
};
