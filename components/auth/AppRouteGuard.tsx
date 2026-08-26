"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { AppLoadingShell, AppShell } from "@/components/layout/AppShell";
import { resolveAppRouteAccess } from "@/lib/auth/guards";

export function AppRouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/app";
  const router = useRouter();
  const { authorization, authorizationLoading } = useAuth();
  const decision = resolveAppRouteAccess(authorization, authorizationLoading, pathname);

  useEffect(() => {
    if (decision === "deny") {
      router.replace("/unauthorized");
    }
  }, [decision, router]);

  if (decision === "wait") {
    return <AppLoadingShell />;
  }

  if (decision === "deny" || !authorization) {
    return <AppLoadingShell message="Redirecionando…" />;
  }

  return <AppShell authorization={authorization}>{children}</AppShell>;
}

export function AppWorkspace({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AppRouteGuard>{children}</AppRouteGuard>
    </RequireAuth>
  );
}
