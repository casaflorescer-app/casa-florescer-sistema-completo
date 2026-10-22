"use client";

import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AppLoadingShell } from "@/components/layout/AppShell";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [loading, user]);

  if (loading || !user) {
    return <AppLoadingShell message="Verificando sessão…" />;
  }

  return children;
}
