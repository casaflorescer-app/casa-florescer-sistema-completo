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
      {
        id: "obstetrics",
        label: "Programação obstétrica",
        href: "/app/obstetrics",
        visible: physician,
      },
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
    title: "Relacionamentos",
    items: [
      {
        id: "relationship-central",
        label: "Central de Relacionamentos",
        href: "/app/relationship",
        visible: (auth) =>
          hasStaffRole(auth, "secretary") ||
          hasStaffRole(auth, "owner") ||
          hasStaffRole(auth, "admin") ||
          hasStaffRole(auth, "physician"),
      },
      {
        id: "relationship-contact",
        label: "Relacionamentos",
        href: "/app/relationship?tab=contact",
        // Mesmo módulo; atalho para a fila operacional.
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
      // C070 — um item de menu; subnav Salas | Aluguéis | Contratos de locação nas páginas.
      {
        id: "rooms",
        label: "Salas e locações",
        href: "/app/rooms",
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
        label: "Relatórios",
        href: "/app/reports",
        visible: clinicManagement,
      },
      {
        id: "clinic-admin",
        label: "Administração",
        href: "/app/admin",
        visible: (auth) =>
          clinicManagement(auth) ||
          auth.memberships.some(
            (item) => item.role === "secretary" && item.canViewCarePolicies,
          ),
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
      // C066: system settings placeholder D removido do menu.
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
