import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { AppRole, PracticeKind } from "@/lib/types/database";

export type StaffRole = AppRole;

export type MembershipClinicalAccess = "none" | "own_encounters" | "practice";

export type AuthorizationUser = {
  id: string;
  email: string | null;
};

export type AuthorizationProfile = {
  id: string;
  organizationId: string;
  fullName: string;
  email: string;
  isActive: boolean;
  uiModules: string[];
};

export type AuthorizationPatientAccount = {
  patientId: string;
  organizationId: string;
};

export type AuthorizationOrganization = {
  id: string;
  legalName?: string;
  tradeName?: string;
};

export type AuthorizationPractice = {
  kind: PracticeKind;
  code: string;
  name: string;
  specialty?: string | null;
  isolationLabel?: string | null;
  isActive: boolean;
  organizationId: string;
};

export type AuthorizationProfessional = {
  id: string;
  councilType: string;
  councilNumber: string;
};

export type AuthorizationMembership = {
  practiceId: string;
  practice: AuthorizationPractice | null;
  role: StaffRole;
  clinicalAccess: MembershipClinicalAccess;
  canCashier: boolean;
  canScheduleAnyPractice: boolean;
  canManageStock: boolean;
  professional: AuthorizationProfessional | null;
};

export type AuthorizationContext = {
  user: AuthorizationUser;
  profile: AuthorizationProfile | null;
  patientAccount: AuthorizationPatientAccount | null;
  isSystemAdmin: boolean;
  organization: AuthorizationOrganization | null;
  memberships: AuthorizationMembership[];
};

export type AuthorizationErrorKind = "network" | "acl" | "schema" | "unknown";

export type AuthorizationLoadError = {
  kind: AuthorizationErrorKind;
  table?: string;
  message: string;
};

export type AuthorizationLoadResult = {
  context: AuthorizationContext;
  error: AuthorizationLoadError | null;
};

const STAFF_ROLES: StaffRole[] = ["owner", "admin", "physician", "secretary"];
const CLINICAL_ACCESS: MembershipClinicalAccess[] = [
  "none",
  "own_encounters",
  "practice",
];

function emptyContext(user: AuthorizationUser): AuthorizationContext {
  return {
    user,
    profile: null,
    patientAccount: null,
    isSystemAdmin: false,
    organization: null,
    memberships: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function classifyError(error: unknown, table?: string): AuthorizationLoadError {
  const err = error as { message?: string; code?: string; status?: number };
  const text = `${err?.code ?? ""} ${err?.message ?? ""}`.toLowerCase();
  if (text.includes("failed to fetch") || text.includes("network") || text.includes("fetch")) {
    return {
      kind: "network",
      table,
      message: "Não foi possível conectar para carregar o cadastro da clínica.",
    };
  }
  if (
    text.includes("42501") ||
    text.includes("permission denied") ||
    text.includes("not authorized") ||
    text.includes("rls") ||
    err?.status === 403
  ) {
    return {
      kind: "acl",
      table,
      message: table
        ? `Não foi possível ler ${table} com a sessão atual.`
        : "Não foi possível ler os dados de acesso com a sessão atual.",
    };
  }
  if (
    text.includes("42703") ||
    text.includes("does not exist") ||
    text.includes("schema cache") ||
    text.includes("pgrst")
  ) {
    return {
      kind: "schema",
      table,
      message: table
        ? `A consulta a ${table} não corresponde ao schema esperado.`
        : "A consulta de autorização não corresponde ao schema esperado.",
    };
  }
  return {
    kind: "unknown",
    table,
    message: "Não foi possível carregar o contexto de acesso.",
  };
}

function parseUiModules(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function parseStaffRole(value: unknown): StaffRole | null {
  return typeof value === "string" && (STAFF_ROLES as string[]).includes(value)
    ? (value as StaffRole)
    : null;
}

function parseClinicalAccess(value: unknown): MembershipClinicalAccess {
  if (typeof value === "string" && (CLINICAL_ACCESS as string[]).includes(value)) {
    return value as MembershipClinicalAccess;
  }
  return "none";
}

function parsePractice(value: unknown): AuthorizationPractice | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!isRecord(row)) return null;
  const id = asString(row.id);
  const organizationId = asString(row.organization_id);
  const kind = row.kind === "house" || row.kind === "sublet" ? row.kind : null;
  const code = asString(row.code);
  const name = asString(row.name);
  if (!id || !organizationId || !kind || !code || !name) return null;
  return {
    kind,
    code,
    name,
    specialty: asString(row.specialty),
    isolationLabel: asString(row.isolation_label),
    isActive: asBoolean(row.is_active, true),
    organizationId,
  };
}

type ProfessionalRow = {
  id: string;
  practiceId: string;
  councilType: string;
  councilNumber: string;
};

function toMembership(
  row: Record<string, unknown>,
  practiceId: string,
  role: StaffRole,
  practice: AuthorizationPractice | null,
  professionals: ProfessionalRow[],
): AuthorizationMembership {
  const professional =
    professionals
      .filter((item) => item.practiceId === practiceId)
      .map((item) => ({
        id: item.id,
        councilType: item.councilType,
        councilNumber: item.councilNumber,
      }))[0] ?? null;
  return {
    practiceId,
    practice,
    role,
    clinicalAccess: parseClinicalAccess(row.clinical_access),
    canCashier: asBoolean(row.can_cashier),
    canScheduleAnyPractice: asBoolean(row.can_schedule_any_practice),
    canManageStock: asBoolean(row.can_manage_stock),
    professional,
  };
}

function firstError(errors: Array<AuthorizationLoadError | null>): AuthorizationLoadError | null {
  return errors.find((item) => item !== null) ?? null;
}

export async function loadAuthorizationContext(
  supabase: SupabaseClient,
  user: Pick<User, "id" | "email"> | AuthorizationUser,
): Promise<AuthorizationLoadResult> {
  const authUser: AuthorizationUser = {
    id: user.id,
    email: user.email ?? null,
  };
  const context = emptyContext(authUser);
  const errors: Array<AuthorizationLoadError | null> = [];

  const [adminResult, profileResult, rolesResult, professionalsResult, patientResult] =
    await Promise.all([
      supabase.rpc("is_system_admin"),
      supabase
        .from("profiles")
        .select("id, organization_id, full_name, email, is_active, permissions")
        .eq("id", authUser.id)
        .maybeSingle(),
      supabase
        .from("user_practice_roles")
        .select(
          "id, practice_id, role, clinical_access, can_cashier, can_schedule_any_practice, can_manage_stock, practice_units ( id, organization_id, kind, code, name, specialty, isolation_label, is_active )",
        )
        .eq("user_id", authUser.id),
      supabase
        .from("professionals")
        .select("id, practice_id, organization_id, council_type, council_number")
        .eq("profile_id", authUser.id),
      supabase
        .from("patient_accounts")
        .select("patient_id, organization_id")
        .eq("user_id", authUser.id)
        .maybeSingle(),
    ]);

  if (adminResult.error) {
    context.isSystemAdmin = false;
    errors.push(classifyError(adminResult.error, "is_system_admin"));
  } else {
    context.isSystemAdmin = adminResult.data === true;
  }

  if (profileResult.error) {
    errors.push(classifyError(profileResult.error, "profiles"));
  } else if (profileResult.data) {
    const row = profileResult.data;
    const organizationId = asString(row.organization_id);
    const fullName = asString(row.full_name);
    const email = asString(row.email) ?? authUser.email ?? "";
    if (organizationId && fullName) {
      context.profile = {
        id: asString(row.id) ?? authUser.id,
        organizationId,
        fullName,
        email,
        isActive: asBoolean(row.is_active, false),
        uiModules: parseUiModules(row.permissions),
      };
    }
  }

  if (professionalsResult.error) {
    errors.push(classifyError(professionalsResult.error, "professionals"));
  }
  const professionals = (professionalsResult.data ?? []).flatMap((row) => {
    const id = asString(row.id);
    const practiceId = asString(row.practice_id);
    const councilType = asString(row.council_type);
    const councilNumber = asString(row.council_number);
    if (!id || !practiceId || !councilType || !councilNumber) return [];
    return [{ id, practiceId, councilType, councilNumber }];
  });

  if (rolesResult.error) {
    const classified = classifyError(rolesResult.error, "user_practice_roles");
    if (classified.kind === "schema") {
      const plainRoles = await supabase
        .from("user_practice_roles")
        .select(
          "id, practice_id, role, clinical_access, can_cashier, can_schedule_any_practice, can_manage_stock",
        )
        .eq("user_id", authUser.id);
      if (plainRoles.error) {
        errors.push(classifyError(plainRoles.error, "user_practice_roles"));
      } else {
        context.memberships = (plainRoles.data ?? []).flatMap((row) => {
          const practiceId = asString(row.practice_id);
          const role = parseStaffRole(row.role);
          if (!practiceId || !role) return [];
          return [toMembership(row as Record<string, unknown>, practiceId, role, null, professionals)];
        });
      }
    } else {
      errors.push(classified);
    }
  } else {
    context.memberships = (rolesResult.data ?? []).flatMap((row) => {
      const practiceId = asString(row.practice_id);
      const role = parseStaffRole(row.role);
      if (!practiceId || !role) return [];
      return [
        toMembership(
          row as Record<string, unknown>,
          practiceId,
          role,
          parsePractice((row as Record<string, unknown>).practice_units),
          professionals,
        ),
      ];
    });
  }

  if (patientResult.error) {
    errors.push(classifyError(patientResult.error, "patient_accounts"));
  } else if (patientResult.data) {
    const patientId = asString(patientResult.data.patient_id);
    const organizationId = asString(patientResult.data.organization_id);
    if (patientId && organizationId) {
      context.patientAccount = { patientId, organizationId };
    }
  }

  if (context.profile?.organizationId) {
    const orgResult = await supabase
      .from("organizations")
      .select("id, legal_name, trade_name")
      .eq("id", context.profile.organizationId)
      .maybeSingle();
    if (orgResult.error) {
      errors.push(classifyError(orgResult.error, "organizations"));
    } else if (orgResult.data) {
      const id = asString(orgResult.data.id);
      if (id) {
        context.organization = {
          id,
          legalName: asString(orgResult.data.legal_name) ?? undefined,
          tradeName: asString(orgResult.data.trade_name) ?? undefined,
        };
      }
    }
  }

  return { context, error: firstError(errors) };
}
