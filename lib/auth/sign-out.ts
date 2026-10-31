import { createClient } from "@/lib/supabase/client";

export async function signOutBrowser() {
  try {
    await fetch("/api/casa/session", { method: "DELETE" });
  } catch {
    // A sessão do Auth ainda precisa ser encerrada.
  }
  const supabase = createClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
}
