import type { AuthorizationContext, StaffRole } from "@/lib/auth/authorization";
import {
  canAccessClinicManagement,
  hasStaffRole,
  isClinicStaff,
  isPatientPortalUser,
} from "@/lib/auth/access";
import { getChatwootUrl } from "@/lib/integrations/external-services";

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
  /** Link externo: abre em nova aba (não usa Next Link). */
  external?: boolean;
  visible: (auth: AuthorizationContext) => boolean;
};

const relationshipVisible = (auth: AuthorizationContext) =>
  hasStaffRole(auth, "secretary") ||
  hasStaffRole(auth, "owner") ||
  hasStaffRole(auth, "admin") ||
  hasStaffRole(auth, "physician");

export type AppNavSection = {
  id: AppNavSectionId;
  title: string;
  items: AppNavItem[];
};

const clinicStaff = (auth: AuthorizationContext) => isClinicStaff(auth);
const physician = (auth: AuthorizationContext) => hasStaffRole(auth, "physician");
const clinicManagement = (auth: AuthorizationContext) => canAccessClinicManagement(auth);

/**
 * C070-C4.2 — PAINEL → CLÍNICO → RELACIONAMENTOS → GESTÃO → PLATAFORMA.
 * Hubs: Pessoas, Administração, Plataforma, Salas e Locações, Central.
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
    title: "Clínico",
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
        visible: relationshipVisible,
      },
      // C070-C8 — atalho externo (nova aba); não duplica a seção.
      {
        id: "relationship-chatwoot",
        label: "Chatwoot",
        href: getChatwootUrl(),
        external: true,
        visible: relationshipVisible,
      },
    ],
  },
  {
    id: "gestao_clinica",
    title: "Gestão",
    items: [
      {
        id: "rooms",
        label: "Salas e Locações",
        href: "/app/rooms",
        visible: clinicManagement,
      },
      {
        id: "clinical-contracts",
        label: "Contratos clínicos",
        href: "/app/clinical-contracts",
        visible: clinicManagement,
      },
      // C070-C4.2 — hub Pessoas (profissionais + especialidades + funcionários).
      {
        id: "people",
        label: "Pessoas",
        href: "/app/people",
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
    title: "Plataforma",
    items: [
      // C070-C4.2 — único item; orgs/users/audit ficam no hub /app/system.
      {
        id: "system-home",
        label: "Plataforma",
        href: "/app/system",
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
