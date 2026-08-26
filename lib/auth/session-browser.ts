import { createClient } from "@/lib/supabase/client";
import { sessionFromAuthUser, toAuthUser } from "./user";
import type { SessionContext } from "@/lib/types/domain";

export async function loadBrowserSession(): Promise<SessionContext | null> {
  if (typeof window === "undefined") return null;

  const supabase = createClient();
  if (!supabase) return null;

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    return sessionFromAuthUser(toAuthUser(user));
  } catch {
    return null;
  }
}
