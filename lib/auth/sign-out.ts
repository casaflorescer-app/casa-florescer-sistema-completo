import { createClient } from "@/lib/supabase/client";

export async function signOutBrowser() {
  const supabase = createClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
}
