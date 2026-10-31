import { createBrowserClient } from "@supabase/ssr";
import { isSupabaseConfigured } from "./config";

export { isSupabaseConfigured } from "./config";

export function createClient() {
  if (process.env.NEXT_PUBLIC_CASA_AUTH === "1") return null;
  if (!isSupabaseConfigured()) return null;
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
