import type { User } from "@supabase/supabase-js";

export const CHANGE_PASSWORD_PATH = "/auth/change-password";

export function userMustChangePassword(user: User | null | undefined): boolean {
  if (!user) return false;
  return user.user_metadata?.must_change_password === true;
}
