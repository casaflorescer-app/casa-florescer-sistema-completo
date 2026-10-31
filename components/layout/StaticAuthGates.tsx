"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AUTHENTICATED_HOME } from "@/lib/auth/paths";

function LoadingLine() {
  return (
    <p className="px-4 py-6 text-sm text-lotus-600">Carregando…</p>
  );
}

export function RedirectIfSession() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (user) window.location.assign(AUTHENTICATED_HOME);
  }, [user, loading]);

  return null;
}

export function ClientRoleHomeRedirect() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    window.location.assign(user ? AUTHENTICATED_HOME : "/login");
  }, [user, loading]);

  return <LoadingLine />;
}

/** FASE 6: gates por papel. Nesta etapa só autenticação (layouts usam RoleGate no servidor). */
export function ClientStaffGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function ClientPatientGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
