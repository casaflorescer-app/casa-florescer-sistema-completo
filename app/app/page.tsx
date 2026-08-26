"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { RoleDashboard } from "@/components/dashboard/RoleDashboard";

export default function AppHomePage() {
  const { authorization, authorizationError } = useAuth();

  if (!authorization) return null;

  return (
    <div className="space-y-4">
      {authorizationError ? (
        <p className="rounded-xl border border-rose-100 bg-white px-4 py-3 text-sm text-rose-800" role="alert">
          {authorizationError.message} O acesso continua limitado ao que foi carregado com
          segurança. Nenhum privilégio extra foi concedido.
        </p>
      ) : null}
      <RoleDashboard auth={authorization} />
    </div>
  );
}
