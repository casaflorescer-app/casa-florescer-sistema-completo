"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { RequireRole } from "@/components/auth/RequireRole";
import { AppLoadingShell } from "@/components/layout/AppShell";
import { hasAnyStaffRole } from "@/lib/auth/access";

function UsersRouteAccess({ children }: { children: ReactNode }) {
  const { authorization, authorizationLoading } = useAuth();
  if (authorizationLoading || !authorization) return <AppLoadingShell />;
  const allowed =
    authorization.isSystemAdmin || hasAnyStaffRole(authorization, ["owner", "admin"]);
  if (!allowed) return <AccessDenied />;
  return children;
}

export default function ClinicAdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";
  const users =
    pathname === "/app/admin/users" || pathname.startsWith("/app/admin/users/");
  if (users) return <UsersRouteAccess>{children}</UsersRouteAccess>;
  return <RequireRole roles={["owner", "admin"]}>{children}</RequireRole>;
}
