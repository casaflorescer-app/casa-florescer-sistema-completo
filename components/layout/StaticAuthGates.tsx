"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { AUTHENTICATED_HOME } from "@/lib/auth/paths";

function LoadingLine() {
  return (
    <p className="px-4 py-6 text-sm text-lotus-600">Carregando…</p>
  );
}

export function RedirectIfSession() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (user) router.replace(AUTHENTICATED_HOME);
  }, [user, loading, router]);

  return null;
}

export function ClientRoleHomeRedirect() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    router.replace(AUTHENTICATED_HOME);
  }, [user, loading, router]);

  return <LoadingLine />;
}

/** FASE 6: gates por papel. Nesta etapa só autenticação (layouts usam RoleGate no servidor). */
export function ClientStaffGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function ClientPatientGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
