import type { SupabaseClient, User } from "@supabase/supabase-js";
import { defaultModulesForRole, normalizeModules } from "../permissions";
import { resolveUiRole } from "../rbac";
import type { AppRole } from "../types/database";
import type { SessionContext } from "../types/domain";

export async function sessionFromSupabase(
  supabase: SupabaseClient,
  user: User,
): Promise<SessionContext | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, permissions")
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
  const uiRole = resolveUiRole(staffRoles, Boolean(patientAccount));
  if (!uiRole) return null;

  return {
    userId: user.id,
    fullName: profile?.full_name ?? user.email ?? "Usuária",
    email: profile?.email ?? user.email ?? "",
    uiRole,
    staffRoles,
    practiceIds: [...new Set((roles ?? []).map((row) => row.practice_id))],
    patientId: patientAccount?.patient_id ?? null,
    isPreview: false,
    permissions: normalizeModules(
      profile?.permissions,
      defaultModulesForRole(uiRole),
    ),
  };
}
