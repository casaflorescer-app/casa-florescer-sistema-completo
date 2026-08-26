import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppRole } from "@/lib/types/database";
import { mapDbError } from "@/lib/platform/format";
import type {
  PlatformMembership,
  PlatformUser,
  SystemAdminRecord,
} from "@/lib/platform/types";

const STAFF_ROLES: AppRole[] = ["owner", "admin", "physician", "secretary"];

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function parseRole(value: unknown): AppRole | null {
  return typeof value === "string" && (STAFF_ROLES as string[]).includes(value)
    ? (value as AppRole)
    : null;
}

export async function listPlatformUsers(supabase: SupabaseClient): Promise<PlatformUser[]> {
  let rolesResult = await supabase
    .from("user_practice_roles")
    .select("user_id, role, clinical_access, practice_id, practice_units ( name, code )");
  if (rolesResult.error) {
    rolesResult = await supabase
      .from("user_practice_roles")
      .select("user_id, role, clinical_access, practice_id");
  }

  const [profilesResult, orgsResult, adminsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, organization_id, full_name, email, is_active, created_at")
      .order("full_name"),
    supabase.from("organizations").select("id, legal_name, trade_name"),
    supabase.from("system_admins").select("user_id, revoked_at"),
  ]);

  if (profilesResult.error) throw new Error(mapDbError(profilesResult.error));
  if (orgsResult.error) throw new Error(mapDbError(orgsResult.error));
  if (rolesResult.error) throw new Error(mapDbError(rolesResult.error));
  const activeAdmins = new Set(
    (adminsResult.error ? [] : adminsResult.data ?? [])
      .filter((row) => row.revoked_at == null)
      .map((row) => asString(row.user_id))
      .filter((id): id is string => Boolean(id)),
  );

  const orgNames = new Map<string, string>();
  for (const row of orgsResult.data ?? []) {
    const id = asString(row.id);
    if (!id) continue;
    orgNames.set(id, asString(row.trade_name) ?? asString(row.legal_name) ?? id);
  }

  const membershipsByUser = new Map<string, PlatformMembership[]>();
  for (const row of rolesResult.data ?? []) {
    const userId = asString(row.user_id);
    const role = parseRole(row.role);
    const practiceId = asString(row.practice_id);
    if (!userId || !role || !practiceId) continue;
    const practiceRaw = (row as Record<string, unknown>).practice_units;
    const practice = Array.isArray(practiceRaw) ? practiceRaw[0] : practiceRaw;
    const practiceName =
      practice && typeof practice === "object"
        ? asString((practice as Record<string, unknown>).name) ??
          asString((practice as Record<string, unknown>).code) ??
          practiceId
        : practiceId;
    const list = membershipsByUser.get(userId) ?? [];
    list.push({
      practiceId,
      practiceName,
      role,
      clinicalAccess: asString(row.clinical_access) ?? "none",
    });
    membershipsByUser.set(userId, list);
  }

  return (profilesResult.data ?? []).flatMap((row) => {
    const id = asString(row.id);
    const fullName = asString(row.full_name);
    const email = asString(row.email);
    const organizationId = asString(row.organization_id);
    const createdAt = asString(row.created_at);
    if (!id || !fullName || !email || !organizationId || !createdAt) return [];
    return [
      {
        id,
        fullName,
        email,
        organizationId,
        organizationName: orgNames.get(organizationId) ?? null,
        isActive: asBoolean(row.is_active, false),
        createdAt,
        lastAccess: null,
        isSystemAdmin: activeAdmins.has(id),
        memberships: membershipsByUser.get(id) ?? [],
      },
    ];
  });
}

export async function countProfiles(supabase: SupabaseClient) {
  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true });
  if (error) return null;
  return typeof count === "number" ? count : null;
}

export async function setProfileActive(
  supabase: SupabaseClient,
  userId: string,
  isActive: boolean,
) {
  const { error } = await supabase.from("profiles").update({ is_active: isActive }).eq("id", userId);
  if (error) throw new Error(mapDbError(error));
}

export async function listSystemAdmins(supabase: SupabaseClient): Promise<SystemAdminRecord[]> {
  const [adminsResult, profilesResult] = await Promise.all([
    supabase
      .from("system_admins")
      .select("user_id, granted_by, granted_at, revoked_at, reason")
      .order("granted_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name, email"),
  ]);
  if (adminsResult.error) throw new Error(mapDbError(adminsResult.error));
  if (profilesResult.error) throw new Error(mapDbError(profilesResult.error));

  const names = new Map<string, { name: string; email: string }>();
  for (const row of profilesResult.data ?? []) {
    const id = asString(row.id);
    const name = asString(row.full_name);
    const email = asString(row.email);
    if (!id || !name || !email) continue;
    names.set(id, { name, email });
  }

  return (adminsResult.data ?? []).flatMap((row) => {
    const userId = asString(row.user_id);
    const grantedAt = asString(row.granted_at);
    const reason = asString(row.reason);
    if (!userId || !grantedAt || !reason) return [];
    const user = names.get(userId);
    const grantedById = asString(row.granted_by);
    return [
      {
        userId,
        userName: user?.name ?? userId,
        userEmail: user?.email ?? "—",
        grantedAt,
        grantedById,
        grantedByName: grantedById ? names.get(grantedById)?.name ?? grantedById : null,
        reason,
        revokedAt: asString(row.revoked_at),
        status: row.revoked_at ? "revogado" : "ativo",
      },
    ];
  });
}

export async function countActiveSystemAdmins(supabase: SupabaseClient) {
  const { count, error } = await supabase
    .from("system_admins")
    .select("user_id", { count: "exact", head: true })
    .is("revoked_at", null);
  if (error) return null;
  return typeof count === "number" ? count : null;
}

export async function grantSystemAdmin(
  supabase: SupabaseClient,
  userId: string,
  reason: string,
) {
  const trimmed = reason.trim();
  if (trimmed.length < 3) throw new Error("Informe um motivo com pelo menos 3 caracteres.");
  const { error } = await supabase.rpc("grant_system_admin", {
    p_user_id: userId,
    p_reason: trimmed,
  });
  if (error) throw new Error(mapDbError(error));
}

export async function revokeSystemAdmin(
  supabase: SupabaseClient,
  userId: string,
  reason: string,
) {
  const trimmed = reason.trim();
  if (trimmed.length < 3) throw new Error("Informe um motivo com pelo menos 3 caracteres.");
  const { error } = await supabase.rpc("revoke_system_admin", {
    p_user_id: userId,
    p_reason: trimmed,
  });
  if (error) throw new Error(mapDbError(error));
}
