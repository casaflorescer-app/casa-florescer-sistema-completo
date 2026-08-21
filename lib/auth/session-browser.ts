import { createClient } from "@/lib/supabase/client";
import { findDirectoryUserByEmail, listDirectoryUsers } from "@/lib/admin/directory";
import { readPreviewAclFromStorage, readPreviewUserId } from "@/lib/preview-api";
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
  if (preview) {
    const userId = readPreviewUserId();
    const fallbackEmail: Record<typeof preview, string> = {
      physician: "medica@florescer.clinica",
      secretary: "secretaria@florescer.clinica",
      manager: "admin@florescer.clinica",
      patient: "paciente@florescer.clinica",
    };
    const directory =
      (userId ? listDirectoryUsers().find((user) => user.userId === userId) : null) ??
      findDirectoryUserByEmail(fallbackEmail[preview]);
    const identity = directory
      ? { userId: directory.userId, fullName: directory.fullName, email: directory.email }
      : null;
    return previewSession(preview, readPreviewAclFromStorage(), identity);
  }

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
