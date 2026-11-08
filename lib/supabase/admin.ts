import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "./config";

/**
 * Cliente service_role — só no servidor (API routes / scripts).
 * Aceita SUPABASE_SERVICE_ROLE_KEY ou SERVICE_ROLE_KEY (runtime EasyPanel).
 * Nunca expor no browser nem como NEXT_PUBLIC_*.
 */
export function getServiceRoleKey(): string | null {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SERVICE_ROLE_KEY?.trim() ||
    "";
  return key || null;
}

export function createServiceRoleClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = getServiceRoleKey();
  if (!url || !key || !isSupabaseConfigured()) return null;
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
