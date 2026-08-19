import type { AppRole } from "./database";

export type UiRole = "physician" | "secretary" | "manager" | "patient";

export type SessionContext = {
  userId: string;
  fullName: string;
  email: string;
  uiRole: UiRole;
  staffRoles: AppRole[];
  practiceIds: string[];
  patientId: string | null;
  isPreview: boolean;
};

export type NavItem = {
  href: string;
  label: string;
  description: string;
};

export const UI_ROLE_LABEL: Record<UiRole, string> = {
  physician: "Médica",
  secretary: "Secretaria",
  manager: "Gestão",
  patient: "Paciente",
};

export const APPOINTMENT_KIND_LABEL = {
  consultation: "Consulta",
  procedure: "Procedimento",
} as const;

export const EXAM_STATUS_LABEL = {
  pending: "Pendente",
  available: "Disponível para retirada",
  picked_up: "Retirado",
} as const;
