import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  defaultModulesForRole,
  isMasterAdminRole,
  MODULE_IDS,
  normalizeModules,
} from "../permissions";
import { resolveUiRole } from "../rbac";
import type { AppRole } from "../types/database";
import type { SessionContext, UiRole } from "../types/domain";

export async function sessionFromSupabase(
  supabase: SupabaseClient,
  user: User,
): Promise<SessionContext | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, permissions, role")
    .eq("id", user.id)
    .maybeSingle();

  const { data: roles } = await supabase
    .from("user_practice_roles")
    .select("role, practice_id")
    .eq("user_id", user.id);

  const { data: patientAccount } = await supabase
    .from("patient_accounts")
    .select("patient_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const staffRoles = (roles ?? []).map((row) => row.role as AppRole);
  const profileRole = typeof profile?.role === "string" ? profile.role : null;
  let uiRole: UiRole | null =
    profileRole === "admin"
      ? "manager"
      : resolveUiRole(staffRoles, Boolean(patientAccount));
  if (!uiRole && profileRole === "physician") uiRole = "physician";
  if (!uiRole && profileRole === "secretary") uiRole = "secretary";
  if (!uiRole && profileRole === "patient") uiRole = "patient";
  if (!uiRole) return null;

  const master = isMasterAdminRole(uiRole) || profileRole === "admin";

  return {
    userId: user.id,
    fullName: profile?.full_name ?? user.email ?? "Usuária",
    email: profile?.email ?? user.email ?? "",
    uiRole,
    staffRoles: master && staffRoles.length === 0 ? ["admin"] : staffRoles,
    practiceIds: [...new Set((roles ?? []).map((row) => row.practice_id))],
    patientId: patientAccount?.patient_id ?? null,
    isPreview: false,
    permissions: master
      ? [...MODULE_IDS]
      : normalizeModules(profile?.permissions, defaultModulesForRole(uiRole)),
  };
}
