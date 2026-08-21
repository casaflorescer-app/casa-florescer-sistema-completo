import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isSupabaseConfigured } from "./config";

export async function createServerSupabase() {
  if (!isSupabaseConfigured()) return null;
  const jar = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return jar.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              jar.set(name, value, options);
            });
          } catch {
            /* set from Server Component is ignored; middleware refreshes session */
          }
        },
      },
    },
  );
}
