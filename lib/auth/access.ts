import type { StaffRole } from "@/lib/auth/authorization";
import type { AuthorizationContext } from "@/lib/auth/authorization";

const CLINIC_STAFF: StaffRole[] = ["owner", "admin", "physician", "secretary"];

export function hasStaffRole(auth: AuthorizationContext, role: StaffRole): boolean {
  return auth.memberships.some((item) => item.role === role);
}

export function hasAnyStaffRole(
  auth: AuthorizationContext,
  roles: StaffRole[],
): boolean {
  return auth.memberships.some((item) => roles.includes(item.role));
}

export function isClinicStaff(auth: AuthorizationContext): boolean {
  return hasAnyStaffRole(auth, CLINIC_STAFF);
}

/** UI da política comercial (B1). Não substitui RLS. Secretária comum só com flag. */
export function canManageCarePolicies(auth: AuthorizationContext): boolean {
  return hasStaffRole(auth, "owner") || hasStaffRole(auth, "admin") || hasStaffRole(auth, "physician");
}

export function canViewCarePolicies(auth: AuthorizationContext): boolean {
  if (canManageCarePolicies(auth)) return true;
  return auth.memberships.some(
    (item) => item.role === "secretary" && item.canViewCarePolicies,
  );
}

export function canManageProfessionalPolicy(
  auth: AuthorizationContext,
  practiceId: string,
  professionalId: string,
): boolean {
  const atPractice = auth.memberships.filter((item) => item.practiceId === practiceId);
  if (atPractice.some((item) => item.role === "owner" || item.role === "admin")) {
    return true;
  }
  return atPractice.some(
    (item) => item.role === "physician" && item.professional?.id === professionalId,
  );
}

/**
 * B2 UI — repasse entre médicas.
 * NÃO usar canViewCarePolicies: flag da secretária não concede acesso financeiro.
 * Owner/admin: consulta. Principal e retaguarda envolvida: leitura.
 */
export function canViewProcedurePayout(
  auth: AuthorizationContext,
  practiceId: string,
  principalProfessionalId: string,
  backupProfessionalId: string | null,
): boolean {
  const atPractice = auth.memberships.filter((item) => item.practiceId === practiceId);
  if (atPractice.some((item) => item.role === "owner" || item.role === "admin")) {
    return true;
  }
  return atPractice.some((item) => {
    if (item.role !== "physician" || !item.professional?.id) return false;
    if (item.professional.id === principalProfessionalId) return true;
    if (backupProfessionalId && item.professional.id === backupProfessionalId) return true;
    return false;
  });
}

/** Somente a médica principal gerencia valor/status do repasse. Owner/admin não. */
export function canManageProcedurePayout(
  auth: AuthorizationContext,
  practiceId: string,
  principalProfessionalId: string,
): boolean {
  return auth.memberships.some(
    (item) =>
      item.practiceId === practiceId &&
      item.role === "physician" &&
      item.professional?.id === principalProfessionalId,
  );
}

/** Retaguarda envolvida pode editar apenas observações (D1-B). */
export function canEditProcedurePayoutNotes(
  auth: AuthorizationContext,
  practiceId: string,
  principalProfessionalId: string,
  backupProfessionalId: string | null,
): boolean {
  if (canManageProcedurePayout(auth, practiceId, principalProfessionalId)) return true;
  if (!backupProfessionalId) return false;
  return auth.memberships.some(
    (item) =>
      item.practiceId === practiceId &&
      item.role === "physician" &&
      item.professional?.id === backupProfessionalId,
  );
}

export function isPatientPortalUser(auth: AuthorizationContext): boolean {
  return Boolean(auth.patientAccount);
}

export function uniqueStaffRoles(auth: AuthorizationContext): StaffRole[] {
  return [...new Set(auth.memberships.map((item) => item.role))];
}

function normalizePath(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

type PathRule = {
  prefix: string;
  exact?: boolean;
  allow: (auth: AuthorizationContext) => boolean;
};

/**
 * Regras de UI/rota. Não substituem RLS.
 * SYSTEM_ADMIN não recebe clínica automaticamente.
 */
const PATH_RULES: PathRule[] = [
  { prefix: "/unauthorized", exact: true, allow: () => true },
  { prefix: "/app/system", allow: (auth) => auth.isSystemAdmin },
  {
    prefix: "/app/admin",
    allow: (auth) => hasStaffRole(auth, "owner") || hasStaffRole(auth, "admin"),
  },
  { prefix: "/app/portal", allow: (auth) => isPatientPortalUser(auth) },
  { prefix: "/app/records", allow: (auth) => hasStaffRole(auth, "physician") },
  { prefix: "/app/obstetrics", allow: (auth) => hasStaffRole(auth, "physician") },
  {
    prefix: "/app/inventory",
    allow: (auth) =>
      auth.isSystemAdmin ||
      hasStaffRole(auth, "owner") ||
      hasStaffRole(auth, "admin") ||
      auth.memberships.some((item) => item.canManageStock),
  },
  {
    prefix: "/app/reports",
    allow: (auth) => hasStaffRole(auth, "owner") || hasStaffRole(auth, "admin"),
  },
  {
    prefix: "/app/rentals",
    allow: (auth) => hasStaffRole(auth, "owner") || hasStaffRole(auth, "admin"),
  },
  {
    prefix: "/app/specialties",
    allow: (auth) => hasStaffRole(auth, "owner") || hasStaffRole(auth, "admin"),
  },
  {
    prefix: "/app/care-policies",
    allow: (auth) => canViewCarePolicies(auth),
  },
  {
    prefix: "/app/agenda",
    allow: (auth) => isClinicStaff(auth),
  },
  {
    prefix: "/app/patients",
    allow: (auth) => isClinicStaff(auth),
  },
  {
    prefix: "/app/professionals",
    allow: (auth) => isClinicStaff(auth),
  },
  {
    prefix: "/app/rooms",
    allow: (auth) => auth.isSystemAdmin || isClinicStaff(auth),
  },
  {
    prefix: "/app/exams",
    allow: (auth) => isClinicStaff(auth),
  },
  {
    prefix: "/app/prescriptions",
    allow: (auth) => isClinicStaff(auth),
  },
  { prefix: "/app/dashboard", exact: true, allow: () => true },
  { prefix: "/app", exact: true, allow: () => true },
  { prefix: "/medica", allow: (auth) => hasStaffRole(auth, "physician") },
  {
    prefix: "/secretaria",
    allow: (auth) =>
      hasStaffRole(auth, "secretary") ||
      hasStaffRole(auth, "owner") ||
      hasStaffRole(auth, "admin"),
  },
  {
    prefix: "/gestao",
    allow: (auth) => hasStaffRole(auth, "owner") || hasStaffRole(auth, "admin"),
  },
  { prefix: "/paciente", allow: (auth) => isPatientPortalUser(auth) },
];

const SORTED_RULES = [...PATH_RULES].sort((a, b) => b.prefix.length - a.prefix.length);

export function canAccessAppPath(
  auth: AuthorizationContext,
  pathname: string,
): boolean {
  const path = normalizePath(pathname);
  if (path === "/unauthorized") return true;

  // Perfil inativo: sessão Auth pode existir, mas operação no /app é negada na UI.
  // RLS já bloqueia via has_practice_role (exige profiles.is_active).
  if (auth.profile && !auth.profile.isActive) {
    return false;
  }

  // Sem membership, sem portal paciente e sem SYSTEM_ADMIN → sem superfície operacional.
  if (
    auth.memberships.length === 0 &&
    !auth.patientAccount &&
    !auth.isSystemAdmin
  ) {
    return false;
  }

  const rule = SORTED_RULES.find((item) => {
    if (item.exact) return path === item.prefix;
    return path === item.prefix || path.startsWith(`${item.prefix}/`);
  });
  if (!rule) return false;
  return rule.allow(auth);
}

export function preferredHomePath(auth: AuthorizationContext): string {
  if (isPatientPortalUser(auth) && !isClinicStaff(auth) && !auth.isSystemAdmin) {
    return "/app/portal";
  }
  return "/app";
}
