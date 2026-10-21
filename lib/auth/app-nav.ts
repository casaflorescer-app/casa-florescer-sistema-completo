import type { AuthorizationContext, StaffRole } from "@/lib/auth/authorization";
import {
  canAccessClinicManagement,
  hasStaffRole,
  isClinicStaff,
  isPatientPortalUser,
} from "@/lib/auth/access";

export type AppNavSectionId =
  | "painel"
  | "medico"
  | "relacionamentos"
  | "gestao_clinica"
  | "paciente"
  | "sistema";

export type AppNavItem = {
  id: string;
  label: string;
  href: string;
  visible: (auth: AuthorizationContext) => boolean;
};

export type AppNavSection = {
  id: AppNavSectionId;
  title: string;
  items: AppNavItem[];
};

const clinicStaff = (auth: AuthorizationContext) => isClinicStaff(auth);
const physician = (auth: AuthorizationContext) => hasStaffRole(auth, "physician");
const clinicManagement = (auth: AuthorizationContext) => canAccessClinicManagement(auth);

/**
 * C041 — ordem fixa: PAINEL → MÉDICO → CENTRAL → GESTÃO CLÍNICA.
 * Gestão Clínica nunca usa só role=physician.
 */
export const APP_NAV_SECTIONS: AppNavSection[] = [
  {
    id: "painel",
    title: "Painel",
    items: [
      {
        id: "overview",
        label: "Visão geral",
        href: "/app",
        visible: () => true,
      },
    ],
  },
  {
    id: "medico",
    title: "Médico",
    items: [
      { id: "agenda", label: "Agenda", href: "/app/agenda", visible: clinicStaff },
      { id: "patients", label: "Pacientes", href: "/app/patients", visible: clinicStaff },
      { id: "records", label: "Prontuário", href: "/app/records", visible: physician },
      { id: "exams", label: "Exames", href: "/app/exams", visible: clinicStaff },
      {
        id: "prescriptions",
        label: "Receitas",
        href: "/app/prescriptions",
        visible: clinicStaff,
      },
    ],
  },
  {
    id: "relacionamentos",
    title: "Central de Relacionamentos",
    items: [
      {
        id: "relationship",
        label: "Central de Relacionamentos",
        href: "/app/relationship",
        // C041: grupo visível também à médica. Operação de fila permanece
        // secretaria/owner/admin via canManage na página + RPCs (C037).
        visible: (auth) =>
          hasStaffRole(auth, "secretary") ||
          hasStaffRole(auth, "owner") ||
          hasStaffRole(auth, "admin") ||
          hasStaffRole(auth, "physician"),
      },
    ],
  },
  {
    id: "gestao_clinica",
    title: "Gestão Clínica",
    items: [
      {
        id: "rooms",
        label: "Salas",
        href: "/app/rooms",
        visible: clinicManagement,
      },
      {
        id: "rentals",
        label: "Aluguéis e locação",
        href: "/app/rentals",
        visible: clinicManagement,
      },
      {
        id: "rental-contracts",
        label: "Contratos de locação",
        href: "/app/rentals?tab=contracts",
        visible: clinicManagement,
      },
      {
        id: "clinical-contracts",
        label: "Contratos clínicos",
        href: "/app/clinical-contracts",
        visible: clinicManagement,
      },
      {
        id: "professionals",
        label: "Profissionais",
        href: "/app/professionals",
        visible: clinicManagement,
      },
      {
        id: "specialties",
        label: "Especialidades",
        href: "/app/specialties",
        visible: clinicManagement,
      },
      {
        id: "workforce",
        label: "Funcionários",
        href: "/app/workforce",
        visible: clinicManagement,
      },
      {
        id: "inventory",
        label: "Estoques",
        href: "/app/inventory",
        visible: (auth) =>
          clinicManagement(auth) ||
          auth.memberships.some((item) => item.canManageStock),
      },
      {
        id: "reports",
        label: "Relatórios e indicadores",
        href: "/app/reports",
        visible: clinicManagement,
      },
      {
        id: "care-policies",
        label: "Política de atendimento",
        href: "/app/care-policies",
        // Menu de gestão: só gestão clínica / secretária com flag — evita abrir o grupo
        // para médica comum (path /app/care-policies permanece nas PATH_RULES).
        visible: (auth) =>
          clinicManagement(auth) ||
          auth.memberships.some(
            (item) => item.role === "secretary" && item.canViewCarePolicies,
          ),
      },
      {
        id: "clinic-users",
        label: "Usuários",
        href: "/app/admin/users",
        visible: clinicManagement,
      },
      {
        id: "clinic-org",
        label: "Organização",
        href: "/app/admin/organization",
        visible: clinicManagement,
      },
      {
        id: "clinic-permissions",
        label: "Permissões",
        href: "/app/admin/permissions",
        visible: clinicManagement,
      },
      {
        id: "clinic-audit",
        label: "Auditoria",
        href: "/app/admin/audit",
        visible: clinicManagement,
      },
      {
        id: "clinic-settings",
        label: "Configurações da clínica",
        href: "/app/admin/settings",
        visible: clinicManagement,
      },
    ],
  },
  {
    id: "paciente",
    title: "Paciente",
    items: [
      {
        id: "portal",
        label: "Meu portal",
        href: "/app/portal",
        visible: isPatientPortalUser,
      },
    ],
  },
  {
    id: "sistema",
    title: "Administração da plataforma",
    items: [
      {
        id: "system-home",
        label: "Plataforma",
        href: "/app/system",
        visible: (auth) => auth.isSystemAdmin,
      },
      {
        id: "system-orgs",
        label: "Organizações",
        href: "/app/system/organizations",
        visible: (auth) => auth.isSystemAdmin,
      },
      {
        id: "system-users",
        label: "Usuários da plataforma",
        href: "/app/system/users",
        visible: (auth) => auth.isSystemAdmin,
      },
      {
        id: "system-audit",
        label: "Auditoria técnica",
        href: "/app/system/audit",
        visible: (auth) => auth.isSystemAdmin,
      },
      {
        id: "system-settings",
        label: "Configurações do sistema",
        href: "/app/system/settings",
        visible: (auth) => auth.isSystemAdmin,
      },
    ],
  },
];

export function navSectionsFor(auth: AuthorizationContext): AppNavSection[] {
  return APP_NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.visible(auth)),
  })).filter((section) => section.items.length > 0);
}

export function roleLabels(roles: StaffRole[]): string {
  const labels: Record<StaffRole, string> = {
    owner: "Proprietária",
    admin: "Administração",
    physician: "Médica",
    secretary: "Secretaria",
  };
  return roles.map((role) => labels[role]).join(" · ");
}
