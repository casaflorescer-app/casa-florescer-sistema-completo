import { cookies } from "next/headers";
import {
  PREVIEW_ACL_COOKIE,
  PREVIEW_COOKIE,
  parsePreviewRole,
  previewSession,
} from "../rbac";
import type { SessionContext } from "../types/domain";
import { createServerSupabase } from "./server";
import { normalizeModules, type ModuleId } from "../permissions";
import { sessionFromSupabase } from "./hydrate";

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

    return sessionFromSupabase(supabase, user);
  } catch {
    return null;
  }
}
