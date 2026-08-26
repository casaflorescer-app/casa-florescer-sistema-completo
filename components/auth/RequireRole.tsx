"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { AppLoadingShell } from "@/components/layout/AppShell";
import { hasAnyStaffRole } from "@/lib/auth/access";
import { requireSystemAdmin } from "@/lib/auth/guards";
import type { StaffRole } from "@/lib/auth/authorization";

export function RequireRole({
  roles,
  children,
}: {
  roles: StaffRole[];
  children: ReactNode;
}) {
  const { authorization, authorizationLoading } = useAuth();

  if (authorizationLoading || !authorization) {
    return <AppLoadingShell />;
  }

  if (!hasAnyStaffRole(authorization, roles)) {
    return <AccessDenied />;
  }

  return children;
}

export function RequireSystemAdmin({ children }: { children: ReactNode }) {
  const { authorization, authorizationLoading } = useAuth();

  if (authorizationLoading || !authorization) {
    return <AppLoadingShell />;
  }

  if (!requireSystemAdmin(authorization)) {
    return <AccessDenied />;
  }

  return children;
}
