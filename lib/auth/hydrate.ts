import type { SupabaseClient, User } from "@supabase/supabase-js";
import { loadAuthorizationContext, type AuthorizationLoadResult } from "./authorization";
import { sessionFromAuthUser, toAuthUser } from "./user";
import type { SessionContext } from "@/lib/types/domain";

export { loadAuthorizationContext } from "./authorization";

/** Identidade Auth para o shell legado. Papéis reais vêm de loadAuthorizationContext. */
export async function sessionFromSupabase(
  _supabase: SupabaseClient,
  user: User,
): Promise<SessionContext | null> {
  return sessionFromAuthUser(toAuthUser(user));
}

export async function hydrateAuthorization(
  supabase: SupabaseClient,
  user: User,
): Promise<AuthorizationLoadResult> {
  return loadAuthorizationContext(supabase, user);
}
