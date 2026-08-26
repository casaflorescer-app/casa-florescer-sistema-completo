import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppRole, PracticeKind } from "@/lib/types/database";
import { mapDbError } from "@/lib/platform/format";
import {
  STAFF_ROLE_OPTIONS,
  type MembershipCreateInput,
  type PlatformMembership,
  type PlatformPractice,
  type PlatformUser,
  type SystemAdminRecord,
} from "@/lib/platform/types";

const STAFF_ROLES: AppRole[] = STAFF_ROLE_OPTIONS.map((item) => item.value);
const MEMBERSHIP_COLUMNS =
  "id, user_id, role, clinical_access, practice_id, practice_units ( name, code, kind, organization_id )" as const;

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

function parsePracticeKind(value: unknown): PracticeKind | null {
  return value === "house" || value === "sublet" ? value : null;
}

function logMembershipError(
  scope: string,
  error: { code?: string; message?: string; details?: string; hint?: string },
) {
  console.error(`[platform] membership ${scope} failed`, {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });
}

function isRlsError(error: { code?: string; message?: string }) {
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return (
    error.code === "42501" ||
    text.includes("row-level security") ||
    text.includes("permission denied") ||
    text.includes("not authorized") ||
    text.includes("rls")
  );
}

function mapMembershipError(error: { code?: string; message?: string }): string {
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  if (error.code === "23505" || text.includes("duplicate") || text.includes("unique")) {
    return "Este usuário já possui este vínculo.";
  }
  if (isRlsError(error)) {
    return "Você não possui permissão para alterar o acesso deste usuário.";
  }
  return "Não foi possível alterar o acesso. Tente novamente.";
}

function practiceFromJoin(value: unknown): { name: string | null; kind: PracticeKind | null } {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return { name: null, kind: null };
  const record = row as Record<string, unknown>;
  return {
    name: asString(record.name) ?? asString(record.code),
    kind: parsePracticeKind(record.kind),
  };
}

function toMembership(row: Record<string, unknown>): PlatformMembership | null {
  const id = asString(row.id);
  const practiceId = asString(row.practice_id);
  const role = parseRole(row.role);
  if (!id || !practiceId || !role) return null;
  const practice = practiceFromJoin(row.practice_units);
  return {
    id,
    practiceId,
    practiceName: practice.name ?? practiceId,
    practiceKind: practice.kind,
    role,
    clinicalAccess: asString(row.clinical_access) ?? "none",
  };
}

export async function listPlatformUsers(supabase: SupabaseClient): Promise<PlatformUser[]> {
  let rolesResult = await supabase.from("user_practice_roles").select(MEMBERSHIP_COLUMNS);
  if (rolesResult.error) {
    rolesResult = await supabase
      .from("user_practice_roles")
      .select("id, user_id, role, clinical_access, practice_id");
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
    const membership = toMembership(row as Record<string, unknown>);
    if (!userId || !membership) continue;
    const list = membershipsByUser.get(userId) ?? [];
    list.push(membership);
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

export async function listPracticeUnits(supabase: SupabaseClient): Promise<PlatformPractice[]> {
  const { data, error } = await supabase
    .from("practice_units")
    .select("id, organization_id, name, code, kind, is_active")
    .order("name");
  if (error) {
    logMembershipError("list_practices", error);
    throw new Error(mapMembershipError(error));
  }
  return (data ?? []).flatMap((row) => {
    const id = asString(row.id);
    const organizationId = asString(row.organization_id);
    const name = asString(row.name) ?? asString(row.code);
    const code = asString(row.code) ?? "";
    const kind = parsePracticeKind(row.kind);
    if (!id || !organizationId || !name || !kind) return [];
    return [
      {
        id,
        organizationId,
        name,
        code,
        kind,
        isActive: asBoolean(row.is_active, true),
      },
    ];
  });
}

export async function listUserMemberships(
  supabase: SupabaseClient,
  userId: string,
): Promise<PlatformMembership[]> {
  let result = await supabase.from("user_practice_roles").select(MEMBERSHIP_COLUMNS).eq("user_id", userId);
  if (result.error) {
    result = await supabase
      .from("user_practice_roles")
      .select("id, user_id, role, clinical_access, practice_id")
      .eq("user_id", userId);
  }
  if (result.error) {
    logMembershipError("list", result.error);
    throw new Error(mapMembershipError(result.error));
  }
  return (result.data ?? []).flatMap((row) => {
    const membership = toMembership(row as Record<string, unknown>);
    return membership ? [membership] : [];
  });
}

export async function createMembership(
  supabase: SupabaseClient,
  input: MembershipCreateInput,
): Promise<PlatformMembership> {
  const role = parseRole(input.role);
  if (!role || !input.userId || !input.practiceId) {
    throw new Error("Não foi possível alterar o acesso. Tente novamente.");
  }

  const [profileResult, practiceResult] = await Promise.all([
    supabase.from("profiles").select("id, organization_id").eq("id", input.userId).maybeSingle(),
    supabase
      .from("practice_units")
      .select("id, organization_id")
      .eq("id", input.practiceId)
      .maybeSingle(),
  ]);

  if (profileResult.error) {
    logMembershipError("profile", profileResult.error);
    throw new Error(mapMembershipError(profileResult.error));
  }
  if (practiceResult.error) {
    logMembershipError("practice", practiceResult.error);
    throw new Error(mapMembershipError(practiceResult.error));
  }

  const profileOrg = asString(profileResult.data?.organization_id);
  const practiceOrg = asString(practiceResult.data?.organization_id);
  if (!profileOrg || !practiceOrg || profileOrg !== practiceOrg) {
    console.error("[platform] membership create rejected: organization mismatch", {
      userId: input.userId,
      practiceId: input.practiceId,
      profileOrg,
      practiceOrg,
    });
    throw new Error("A prática selecionada não pertence à organização deste usuário.");
  }

  const { data, error } = await supabase
    .from("user_practice_roles")
    .insert({
      user_id: input.userId,
      practice_id: input.practiceId,
      role,
    })
    .select(MEMBERSHIP_COLUMNS)
    .single();

  if (error) {
    logMembershipError("create", error);
    throw new Error(mapMembershipError(error));
  }
  const membership = toMembership(data as Record<string, unknown>);
  if (!membership) throw new Error("Não foi possível alterar o acesso. Tente novamente.");
  return membership;
}

export async function deleteMembership(supabase: SupabaseClient, membershipId: string) {
  const { error } = await supabase.from("user_practice_roles").delete().eq("id", membershipId);
  if (error) {
    logMembershipError("delete", error);
    throw new Error(mapMembershipError(error));
  }
}
