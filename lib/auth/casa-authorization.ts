import { withCasaUser } from "@/lib/db/casa";
import type {
  AuthorizationContext,
  AuthorizationLoadResult,
  AuthorizationMembership,
  AuthorizationPractice,
  MembershipClinicalAccess,
  StaffRole,
} from "@/lib/auth/authorization";

const STAFF_ROLES: StaffRole[] = ["owner", "admin", "physician", "secretary"];
const CLINICAL: MembershipClinicalAccess[] = ["none", "own_encounters", "practice"];

type ProfileRow = {
  id: string;
  organization_id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  permissions: unknown;
};

type RoleRow = {
  practice_id: string;
  role: string;
  clinical_access: string;
  can_cashier: boolean;
  can_schedule_any_practice: boolean;
  can_manage_stock: boolean;
  can_view_care_policies: boolean;
  practice_kind: string | null;
  practice_code: string | null;
  practice_name: string | null;
  practice_specialty: string | null;
  practice_isolation: string | null;
  practice_active: boolean | null;
  practice_organization_id: string | null;
};

type ProfessionalRow = {
  id: string;
  practice_id: string;
  council_type: string;
  council_number: string;
};

function modules(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function staffRole(value: string): StaffRole | null {
  return (STAFF_ROLES as string[]).includes(value) ? (value as StaffRole) : null;
}

function clinical(value: string): MembershipClinicalAccess {
  return (CLINICAL as string[]).includes(value) ? (value as MembershipClinicalAccess) : "none";
}

function practiceOf(row: RoleRow): AuthorizationPractice | null {
  if (
    !row.practice_organization_id ||
    !row.practice_code ||
    !row.practice_name ||
    (row.practice_kind !== "house" && row.practice_kind !== "sublet")
  ) {
    return null;
  }
  return {
    kind: row.practice_kind,
    code: row.practice_code,
    name: row.practice_name,
    specialty: row.practice_specialty,
    isolationLabel: row.practice_isolation,
    isActive: row.practice_active ?? true,
    organizationId: row.practice_organization_id,
  };
}

export async function loadCasaAuthorization(
  userId: string,
  email: string | null,
): Promise<AuthorizationLoadResult> {
  const context: AuthorizationContext = {
    user: { id: userId, email },
    profile: null,
    patientAccount: null,
    isSystemAdmin: false,
    organization: null,
    memberships: [],
  };

  try {
    await withCasaUser(userId, async (client) => {
      const admin = await client.query<{ is_system_admin: boolean }>(
        "select public.is_system_admin()",
      );
      context.isSystemAdmin = admin.rows[0]?.is_system_admin === true;

      const profile = await client.query<ProfileRow>(
        `select id, organization_id, full_name, email, is_active, permissions
         from public.profiles
         where id = $1`,
        [userId],
      );
      const profileRow = profile.rows[0];
      if (profileRow?.organization_id && profileRow.full_name) {
        context.profile = {
          id: profileRow.id,
          organizationId: profileRow.organization_id,
          fullName: profileRow.full_name,
          email: profileRow.email || email || "",
          isActive: profileRow.is_active,
          uiModules: modules(profileRow.permissions),
        };
        context.user.email = context.profile.email || email;
      }

      const professionals = await client.query<ProfessionalRow>(
        `select id, practice_id, council_type, council_number
         from public.professionals
         where profile_id = $1`,
        [userId],
      );

      const roles = await client.query<RoleRow>(
        `select r.practice_id, r.role::text, r.clinical_access::text,
                r.can_cashier, r.can_schedule_any_practice, r.can_manage_stock,
                r.can_view_care_policies,
                pu.kind::text as practice_kind, pu.code as practice_code,
                pu.name as practice_name, pu.specialty as practice_specialty,
                pu.isolation_label as practice_isolation, pu.is_active as practice_active,
                pu.organization_id as practice_organization_id
         from public.user_practice_roles r
         left join public.practice_units pu on pu.id = r.practice_id
         where r.user_id = $1`,
        [userId],
      );

      context.memberships = roles.rows.flatMap((row) => {
        const role = staffRole(row.role);
        if (!role) return [];
        const professional =
          professionals.rows.find((item) => item.practice_id === row.practice_id) ?? null;
        const membership: AuthorizationMembership = {
          practiceId: row.practice_id,
          practice: practiceOf(row),
          role,
          clinicalAccess: clinical(row.clinical_access),
          canCashier: row.can_cashier,
          canScheduleAnyPractice: row.can_schedule_any_practice,
          canManageStock: row.can_manage_stock,
          canViewCarePolicies: row.can_view_care_policies,
          professional: professional
            ? {
                id: professional.id,
                councilType: professional.council_type,
                councilNumber: professional.council_number,
              }
            : null,
        };
        return [membership];
      });

      const patient = await client.query<{ patient_id: string; organization_id: string }>(
        `select patient_id, organization_id
         from public.patient_accounts
         where user_id = $1`,
        [userId],
      );
      const patientRow = patient.rows[0];
      if (patientRow?.patient_id && patientRow.organization_id) {
        context.patientAccount = {
          patientId: patientRow.patient_id,
          organizationId: patientRow.organization_id,
        };
      }

      if (context.profile?.organizationId) {
        const org = await client.query<{ id: string; legal_name: string; trade_name: string }>(
          `select id, legal_name, trade_name
           from public.organizations
           where id = $1`,
          [context.profile.organizationId],
        );
        const orgRow = org.rows[0];
        if (orgRow) {
          context.organization = {
            id: orgRow.id,
            legalName: orgRow.legal_name,
            tradeName: orgRow.trade_name,
          };
        }
      }
    });
  } catch {
    return {
      context,
      error: {
        kind: "unknown",
        message: "Não foi possível carregar o contexto de acesso.",
      },
    };
  }

  return { context, error: null };
}
