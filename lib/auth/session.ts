import { cookies } from "next/headers";
import {
  PREVIEW_ACL_COOKIE,
  PREVIEW_COOKIE,
  parsePreviewRole,
  previewSession,
  resolveUiRole,
} from "../rbac";
import type { SessionContext } from "../types/domain";
import type { AppRole } from "../types/database";
import { createServerSupabase } from "./server";
import { defaultModulesForRole, normalizeModules, type ModuleId } from "../permissions";

function readAclCookie(): Record<string, ModuleId[]> {
  const raw = cookies().get(PREVIEW_ACL_COOKIE)?.value;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, ModuleId[]> = {};
    for (const [key, value] of Object.entries(parsed)) {
      out[key] = normalizeModules(value, []);
    }
    return out;
  } catch {
    return {};
  }
}

export async function getSessionContext(): Promise<SessionContext | null> {
  const preview = parsePreviewRole(cookies().get(PREVIEW_COOKIE)?.value);
  if (preview) return previewSession(preview, readAclCookie());

  const supabase = await createServerSupabase();
  if (!supabase) return null;

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

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
  } catch {
    return null;
  }
}
