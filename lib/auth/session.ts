import { cookies } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import { COOKIE_NAME, openCasaSession } from "./casa-session";
import { casaSessionActive, isCasaDatabaseConfigured } from "@/lib/db/casa";
import { sessionFromAuthUser, toAuthUser, type AuthUser } from "./user";
import type { SessionContext } from "@/lib/types/domain";

async function casaAuthUser(): Promise<AuthUser | null> {
  if (!isCasaDatabaseConfigured()) return null;
  const opened = await openCasaSession(cookies().get(COOKIE_NAME)?.value);
  if (!opened) return null;
  const active = await casaSessionActive(opened.sessionId);
  if (active !== opened.userId) return null;
  return {
    userId: opened.userId,
    email: "",
    fullName: "Usuária",
    // C075 — caminho casa não usa user_metadata GoTrue; sem flag em staff_credentials.
    mustChangePassword: false,
  };
}

export async function getAuthUser(): Promise<AuthUser | null> {
  if (isCasaDatabaseConfigured()) return casaAuthUser();

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
