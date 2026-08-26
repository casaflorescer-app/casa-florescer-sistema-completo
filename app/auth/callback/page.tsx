"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AUTHENTICATED_HOME } from "@/lib/auth/paths";
import { mapAuthError } from "@/lib/auth/errors";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Entrando…");

  useEffect(() => {
    const run = async () => {
      const supabase = createClient();
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      if (code && supabase) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setMessage(mapAuthError(error, "Não foi possível concluir o acesso."));
          router.replace("/login");
          return;
        }
      }
      router.replace(AUTHENTICATED_HOME);
    };
    void run();
  }, [router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center justify-center px-6">
      <p className="text-sm text-lotus-600">{message}</p>
    </main>
  );
}
