import { createServerSupabase } from "@/lib/supabase/server";
import { sessionFromAuthUser, toAuthUser, type AuthUser } from "./user";
import type { SessionContext } from "@/lib/types/domain";

export async function getAuthUser(): Promise<AuthUser | null> {
  const supabase = await createServerSupabase();
  if (!supabase) return null;

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    return toAuthUser(user);
  } catch {
    return null;
  }
}

export async function getSessionContext(): Promise<SessionContext | null> {
  const user = await getAuthUser();
  if (!user) return null;
  return sessionFromAuthUser(user);
}
