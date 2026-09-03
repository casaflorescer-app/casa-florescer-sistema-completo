"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { AppLoadingShell } from "@/components/layout/AppShell";
import { canManageCarePolicies, canViewCarePolicies } from "@/lib/auth/access";

export function RequireCarePolicyAccess({
  mode = "view",
  children,
}: {
  mode?: "view" | "manage";
  children: ReactNode;
}) {
  const { authorization, authorizationLoading } = useAuth();

  if (authorizationLoading || !authorization) {
    return <AppLoadingShell />;
  }

  const allowed =
    mode === "manage"
      ? canManageCarePolicies(authorization)
      : canViewCarePolicies(authorization);

  if (!allowed) {
    return <AccessDenied />;
  }

  return children;
}
