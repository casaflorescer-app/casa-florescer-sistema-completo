"use client";

import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AppLoadingShell } from "@/components/layout/AppShell";
import { CHANGE_PASSWORD_PATH } from "@/lib/auth/must-change-password";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.replace(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    // C075 — bloquear /app enquanto a senha provisória não for trocada
    if (!loading && user?.mustChangePassword) {
      window.location.replace(CHANGE_PASSWORD_PATH);
    }
  }, [loading, user]);

  if (loading || !user) {
    return <AppLoadingShell message="Verificando sessão…" />;
  }

  if (user.mustChangePassword) {
    return <AppLoadingShell message="Redirecionando para troca de senha…" />;
  }

  return children;
}
