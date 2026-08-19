import type { AppRole } from "./types/database";
import type { NavItem, SessionContext, UiRole } from "./types/domain";

export const PREVIEW_COOKIE = "florescer_preview_role";

const ROLE_HOME: Record<UiRole, string> = {
  physician: "/medica",
  secretary: "/secretaria",
  manager: "/gestao",
  patient: "/paciente",
};

const ROLE_PREFIX: Record<UiRole, string> = ROLE_HOME;

export function resolveUiRole(
  staffRoles: AppRole[],
  hasPatientAccount: boolean,
): UiRole | null {
  if (hasPatientAccount && staffRoles.length === 0) return "patient";
  if (staffRoles.includes("physician")) return "physician";
  if (staffRoles.includes("secretary")) return "secretary";
  if (
    staffRoles.includes("owner") ||
    staffRoles.includes("admin") ||
    staffRoles.includes("inventory") ||
    staffRoles.includes("finance")
  ) {
    return "manager";
  }
  if (hasPatientAccount) return "patient";
  return null;
}

export function homeForRole(role: UiRole): string {
  return ROLE_HOME[role];
}

export function canAccessPath(role: UiRole, pathname: string): boolean {
  if (pathname === "/" || pathname.startsWith("/login")) return true;
  return pathname === ROLE_PREFIX[role] || pathname.startsWith(`${ROLE_PREFIX[role]}/`);
}

export function parsePreviewRole(value: string | undefined | null): UiRole | null {
  if (value === "physician" || value === "secretary" || value === "manager" || value === "patient") {
    return value;
  }
  return null;
}

export function previewSession(role: UiRole): SessionContext {
  const names: Record<UiRole, string> = {
    physician: "Dra. Samara",
    secretary: "Ana Souza",
    manager: "Thais — Gestão",
    patient: "Marina Alves",
  };
  return {
    userId: `preview-${role}`,
    fullName: names[role],
    email: `${role}@florescer.clinica`,
    uiRole: role,
    staffRoles:
      role === "physician"
        ? ["physician"]
        : role === "secretary"
          ? ["secretary"]
          : role === "manager"
            ? ["admin"]
            : [],
    practiceIds: ["preview-house"],
    patientId: role === "patient" ? "preview-patient" : null,
    isPreview: true,
  };
}

export const NAV: Record<UiRole, NavItem[]> = {
  physician: [
    { href: "/medica", label: "Hoje", description: "Partos previstos e demanda" },
    { href: "/medica/agenda", label: "Agenda", description: "Consulta vs procedimento" },
    { href: "/medica/capacidade", label: "Capacidade", description: "Teto diário por tipo" },
    { href: "/medica/prontuario", label: "Prontuário", description: "Histórico obstétrico" },
  ],
  secretary: [
    { href: "/secretaria", label: "Recepção", description: "Salas e alertas" },
    { href: "/secretaria/pacientes", label: "Pacientes", description: "Cadastro e histórico" },
    { href: "/secretaria/agenda", label: "Agenda", description: "Encaixes e confirmações" },
    { href: "/secretaria/reagendamento", label: "Reagendar", description: "Remarcação em massa" },
    { href: "/secretaria/exames", label: "Exames", description: "Solicitação e retirada" },
    { href: "/secretaria/comunicacao", label: "Avisos", description: "Retornos e cancelamentos" },
  ],
  manager: [
    { href: "/gestao", label: "Visão geral", description: "Casa e sublocações" },
    { href: "/gestao/estoque", label: "Estoque", description: "Clínico e copa" },
    { href: "/gestao/auditoria", label: "Auditoria", description: "Conferência periódica" },
    { href: "/gestao/contratos", label: "Contratos", description: "Sublocação dos consultórios" },
  ],
  patient: [
    { href: "/paciente", label: "Acompanhar", description: "Consultas e exames" },
    { href: "/paciente/agenda", label: "Consultas", description: "Horários marcados" },
    { href: "/paciente/exames", label: "Exames", description: "Quando retirar" },
    { href: "/paciente/anexos", label: "Enviar", description: "Anexar exames" },
  ],
};
