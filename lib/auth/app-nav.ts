import type { AuthorizationContext, StaffRole } from "@/lib/auth/authorization";
import {
  canViewCarePolicies,
  hasStaffRole,
  isClinicStaff,
  isPatientPortalUser,
} from "@/lib/auth/access";

export type AppNavSectionId =
  | "inicio"
  | "clinica"
  | "assistencia"
  | "gestao"
  | "administracao"
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
const clinicManagers = (auth: AuthorizationContext) =>
  hasStaffRole(auth, "owner") || hasStaffRole(auth, "admin");
const carePolicyViewers = (auth: AuthorizationContext) => canViewCarePolicies(auth);

export const APP_NAV_SECTIONS: AppNavSection[] = [
  {
    id: "inicio",
    title: "Início",
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
    id: "clinica",
    title: "Clínica",
    items: [
      { id: "agenda", label: "Agenda", href: "/app/agenda", visible: clinicStaff },
      { id: "patients", label: "Pacientes", href: "/app/patients", visible: clinicStaff },
      {
        id: "professionals",
        label: "Profissionais",
        href: "/app/professionals",
        visible: clinicStaff,
      },
      {
        id: "rooms",
        label: "Salas",
        href: "/app/rooms",
        visible: clinicStaff,
      },
      {
        id: "specialties",
        label: "Especialidades",
        href: "/app/specialties",
        visible: clinicManagers,
      },
    ],
  },
  {
    id: "assistencia",
    title: "Assistência",
    items: [
      { id: "records", label: "Prontuário", href: "/app/records", visible: physician },
      { id: "obstetrics", label: "Obstetrícia", href: "/app/obstetrics", visible: physician },
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
    id: "gestao",
    title: "Gestão",
    items: [
      { id: "rentals", label: "Locação de salas", href: "/app/rentals", visible: clinicManagers },
      {
        id: "inventory",
        label: "Estoque",
        href: "/app/inventory",
        visible: (auth) =>
          clinicManagers(auth) ||
          auth.memberships.some((item) => item.canManageStock),
      },
      { id: "reports", label: "Financeiro e relatórios", href: "/app/reports", visible: clinicManagers },
      {
        id: "care-policies",
        label: "Política de atendimento",
        href: "/app/care-policies",
        visible: carePolicyViewers,
      },
    ],
  },
  {
    id: "administracao",
    title: "Administração da clínica",
    items: [
      { id: "clinic-users", label: "Usuários", href: "/app/admin/users", visible: clinicManagers },
      {
        id: "clinic-org",
        label: "Organização",
        href: "/app/admin/organization",
        visible: clinicManagers,
      },
      {
        id: "clinic-permissions",
        label: "Permissões",
        href: "/app/admin/permissions",
        visible: clinicManagers,
      },
      { id: "clinic-audit", label: "Auditoria", href: "/app/admin/audit", visible: clinicManagers },
      {
        id: "clinic-settings",
        label: "Configurações da clínica",
        href: "/app/admin/settings",
        visible: clinicManagers,
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
