import { AUTHENTICATED_HOME } from "./auth/paths";
import type { AppRole } from "./types/database";
import type { SessionContext, UiRole } from "./types/domain";
import {
  defaultModulesForRole,
  hasModule,
  isMasterAdminRole,
  MODULE_IDS,
  moduleByPath,
  type ModuleId,
} from "./permissions";
import { firstSidebarHref } from "./nav";

export const PREVIEW_COOKIE = "florescer_preview_role";
export const PREVIEW_ACL_COOKIE = "florescer_preview_acl";
export const PREVIEW_USER_KEY = "florescer_preview_user";

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
  if (hasPatientAccount) return "patient";
  return null;
}

/** Prefixo legado (preview/_dynamic). Fluxo oficial usa /app via middleware. */
const ROLE_PREFIX: Record<UiRole, string> = {
  physician: "/app",
  secretary: "/app",
  manager: "/app",
  patient: "/app/portal",
};

export function homeForRole(role: UiRole, permissions?: ModuleId[]): string {
  if (role === "patient") return "/app/portal";
  const ids = permissions ?? defaultModulesForRole(role);
  return firstSidebarHref(role, ids) ?? AUTHENTICATED_HOME;
}

/** ACL preview/_dynamic. Autorização oficial: AppRouteGuard + RLS. */
export function canAccessPath(
  role: UiRole,
  pathname: string,
  permissions: ModuleId[],
): boolean {
  if (pathname === "/" || pathname.startsWith("/login")) return true;
  if (isMasterAdminRole(role)) return true;

  if (role === "patient") {
    return (
      pathname === "/app/portal" ||
      pathname.startsWith("/app/portal/") ||
      pathname === "/app" ||
      pathname === "/app/dashboard"
    );
  }

  // Portais legados isolados — preview não deve tratá-los como área ativa
  if (
    pathname.startsWith("/medica") ||
    pathname.startsWith("/secretaria") ||
    pathname.startsWith("/gestao") ||
    pathname.startsWith("/paciente")
  ) {
    return false;
  }

  if (pathname === "/app" || pathname.startsWith("/app/")) {
    const mod = moduleByPath(pathname);
    if (!mod) return true;
    return hasModule(permissions, mod.id);
  }

  const prefix = ROLE_PREFIX[role];
  const inOwnArea = pathname === prefix || pathname.startsWith(`${prefix}/`);
  if (!inOwnArea) return false;

  const mod = moduleByPath(pathname);
  if (!mod) return true;
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
  identity?: { userId: string; fullName: string; email: string } | null,
): SessionContext {
  const names: Record<UiRole, string> = {
    physician: "Dra. Samara",
    secretary: "Ana Souza",
    manager: "Thais",
    patient: "Marina Alves",
  };
  const userId = identity?.userId ?? `preview-${role}`;
  const fallback = defaultModulesForRole(role);
  return {
    userId,
    fullName: identity?.fullName ?? names[role],
    email: identity?.email ?? `${role}@florescer.clinica`,
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
    patientId: role === "patient" ? identity?.userId ?? "preview-patient" : null,
    isPreview: true,
    permissions: isMasterAdminRole(role)
      ? [...MODULE_IDS]
      : aclOverride?.[userId] ?? fallback,
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
