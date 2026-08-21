"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      const supabase = createClient();
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      if (code && supabase) {
        await supabase.auth.exchangeCodeForSession(code);
      }
      router.replace("/");
    };
    void run();
  }, [router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center justify-center px-6">
      <p className="text-sm text-lotus-600">Entrando…</p>
    </main>
  );
}
