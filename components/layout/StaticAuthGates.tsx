"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { StaffShell } from "@/components/layout/StaffShell";
import { PermissionsProvider } from "@/lib/hooks/usePermissions";
import { loadBrowserSession } from "@/lib/auth/session-browser";
import {
  canAccessPath,
  homeForRole,
} from "@/lib/rbac";
import { stripTrailingSlash } from "@/lib/hosting";
import type { SessionContext } from "@/lib/types/domain";

function LoadingLine() {
  return (
    <p className="px-4 py-6 text-sm text-lotus-600">Carregando…</p>
  );
}

export function RedirectIfSession() {
  const router = useRouter();

  useEffect(() => {
    loadBrowserSession().then((session) => {
      if (session) {
        router.replace(homeForRole(session.uiRole, session.permissions));
      }
    });
  }, [router]);

  return null;
}

export function ClientRoleHomeRedirect() {
  const router = useRouter();

  useEffect(() => {
    loadBrowserSession().then((session) => {
      if (!session) {
        router.replace("/login");
        return;
      }
      router.replace(homeForRole(session.uiRole, session.permissions));
    });
  }, [router]);

  return <LoadingLine />;
}

export function ClientStaffGate({ children }: { children: React.ReactNode }) {
  const pathname = stripTrailingSlash(usePathname() || "/");
  const router = useRouter();
  const [session, setSession] = useState<SessionContext | null | undefined>(
    undefined,
  );

  useEffect(() => {
    let cancelled = false;
    loadBrowserSession().then((next) => {
      if (!cancelled) setSession(next);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    if (session === undefined) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    if (session.uiRole === "patient") {
      router.replace("/paciente");
      return;
    }
    if (!canAccessPath(session.uiRole, pathname, session.permissions)) {
      router.replace(homeForRole(session.uiRole, session.permissions));
    }
  }, [session, pathname, router]);

  if (!session || session.uiRole === "patient") return <LoadingLine />;
  if (!canAccessPath(session.uiRole, pathname, session.permissions)) {
    return <LoadingLine />;
  }

  return (
    <PermissionsProvider session={session}>
      <StaffShell session={session}>{children}</StaffShell>
    </PermissionsProvider>
  );
}

export function ClientPatientGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<SessionContext | null | undefined>(
    undefined,
  );

  useEffect(() => {
    let cancelled = false;
    loadBrowserSession().then((next) => {
      if (!cancelled) setSession(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    if (session.uiRole !== "patient") {
      router.replace(homeForRole(session.uiRole, session.permissions));
    }
  }, [session, router]);

  if (!session || session.uiRole !== "patient") return <LoadingLine />;

  return (
    <PermissionsProvider session={session}>
      <StaffShell session={session}>{children}</StaffShell>
    </PermissionsProvider>
  );
}
