import type { AppRole } from "./database";
import type { ModuleId } from "../permissions";

export type UiRole = "physician" | "secretary" | "manager" | "patient";

export type SessionContext = {
  userId: string;
  fullName: string;
  email: string;
  /** Legado de UI. NÃO é autoridade. Papéis reais: authorization.memberships. */
  uiRole: UiRole | null;
  staffRoles: AppRole[];
  practiceIds: string[];
  patientId: string | null;
  isPreview: boolean;
  permissions: ModuleId[];
};

export type NavItem = {
  href: string;
  label: string;
  description: string;
  moduleId?: ModuleId;
};

export const UI_ROLE_LABEL: Record<UiRole, string> = {
  physician: "Médica",
  secretary: "Secretária",
  manager: "Admin Master",
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
