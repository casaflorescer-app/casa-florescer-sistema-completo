import { createClient } from "@/lib/supabase/client";
import { readPreviewAclFromStorage } from "@/lib/preview-api";
import {
  PREVIEW_COOKIE,
  parsePreviewRole,
  previewSession,
} from "@/lib/rbac";
import type { SessionContext } from "@/lib/types/domain";
import { sessionFromSupabase } from "./hydrate";

export async function loadBrowserSession(): Promise<SessionContext | null> {
  if (typeof window === "undefined") return null;

  const preview = parsePreviewRole(localStorage.getItem(PREVIEW_COOKIE));
  if (preview) return previewSession(preview, readPreviewAclFromStorage());

  const supabase = createClient();
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
