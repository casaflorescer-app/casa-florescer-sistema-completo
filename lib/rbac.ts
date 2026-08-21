import type { AppRole } from "./types/database";
import type { SessionContext, UiRole } from "./types/domain";
import {
  defaultModulesForRole,
  hasModule,
  moduleByPath,
  type ModuleId,
} from "./permissions";
import { firstSidebarHref } from "./nav";

export const PREVIEW_COOKIE = "florescer_preview_role";
export const PREVIEW_ACL_COOKIE = "florescer_preview_acl";

export function resolveUiRole(
  staffRoles: AppRole[],
  hasPatientAccount: boolean,
): UiRole | null {
  if (hasPatientAccount && staffRoles.length === 0) return "patient";
  if (staffRoles.includes("physician")) return "physician";
  if (staffRoles.includes("secretary")) return "secretary";
  if (staffRoles.includes("owner") || staffRoles.includes("admin")) {
    return "manager";
  }
  if (staffRoles.includes("inventory")) return "manager";
  if (hasPatientAccount) return "patient";
  return null;
}

const ROLE_PREFIX: Record<UiRole, string> = {
  physician: "/medica",
  secretary: "/secretaria",
  manager: "/gestao",
  patient: "/paciente",
};

export function homeForRole(role: UiRole, permissions?: ModuleId[]): string {
  const ids = permissions ?? defaultModulesForRole(role);
  if (role === "patient") return "/paciente";
  return firstSidebarHref(role, ids) ?? "/login";
}

export function canAccessPath(
  role: UiRole,
  pathname: string,
  permissions: ModuleId[],
): boolean {
  if (pathname === "/" || pathname.startsWith("/login")) return true;
  if (role === "patient") {
    return pathname === "/paciente" || pathname.startsWith("/paciente/");
  }
  if (pathname.startsWith("/paciente")) return false;

  const prefix = ROLE_PREFIX[role];
  const inOwnArea = pathname === prefix || pathname.startsWith(`${prefix}/`);

  if (role !== "manager" && !inOwnArea) return false;

  const mod = moduleByPath(pathname);
  if (!mod) {
    return (
      inOwnArea ||
      (role === "manager" &&
        (pathname.startsWith("/medica") ||
          pathname.startsWith("/secretaria") ||
          pathname.startsWith("/gestao")))
    );
  }
  return hasModule(permissions, mod.id);
}

export function parsePreviewRole(value: string | undefined | null): UiRole | null {
  if (value === "physician" || value === "secretary" || value === "manager" || value === "patient") {
    return value;
  }
  return null;
}

export function previewSession(
  role: UiRole,
  aclOverride?: Record<string, ModuleId[]>,
): SessionContext {
  const names: Record<UiRole, string> = {
    physician: "Dra. Samara",
    secretary: "Ana Souza",
    manager: "Thais",
    patient: "Marina Alves",
  };
  const userId = `preview-${role}`;
  const fallback = defaultModulesForRole(role);
  return {
    userId,
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
    permissions: aclOverride?.[userId] ?? fallback,
  };
}

export const PREVIEW_STAFF = [
  {
    userId: "preview-secretary",
    fullName: "Ana Souza",
    email: "secretaria@florescer.clinica",
    uiRole: "secretary" as const,
  },
  {
    userId: "preview-secretary-2",
    fullName: "Beatriz Lima",
    email: "beatriz@florescer.clinica",
    uiRole: "secretary" as const,
  },
  {
    userId: "preview-secretary-3",
    fullName: "Camila Rocha",
    email: "camila@florescer.clinica",
    uiRole: "secretary" as const,
  },
  {
    userId: "preview-secretary-4",
    fullName: "Daniela Pires",
    email: "daniela@florescer.clinica",
    uiRole: "secretary" as const,
  },
  {
    userId: "preview-physician",
    fullName: "Dra. Samara",
    email: "medica@florescer.clinica",
    uiRole: "physician" as const,
  },
  {
    userId: "preview-physician-2",
    fullName: "Dra. Thais Oliveira",
    email: "thais.medica@florescer.clinica",
    uiRole: "physician" as const,
  },
  {
    userId: "preview-manager",
    fullName: "Thais",
    email: "admin@florescer.clinica",
    uiRole: "manager" as const,
  },
];
