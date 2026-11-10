"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { AppLoadingShell } from "@/components/layout/AppShell";
import { hasAnyStaffRole } from "@/lib/auth/access";

/** Bootstrap: SYSTEM_ADMIN abre admin (práticas/usuários) antes de ter membership house. */
function AdminRouteAccess({ children }: { children: ReactNode }) {
  const { authorization, authorizationLoading } = useAuth();
  if (authorizationLoading || !authorization) return <AppLoadingShell />;
  const allowed =
    authorization.isSystemAdmin || hasAnyStaffRole(authorization, ["owner", "admin"]);
  if (!allowed) return <AccessDenied />;
  return children;
}

export default function ClinicAdminLayout({ children }: { children: ReactNode }) {
  return <AdminRouteAccess>{children}</AdminRouteAccess>;
}
