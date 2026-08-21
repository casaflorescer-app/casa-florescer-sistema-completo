import { redirect } from "next/navigation";
import { StaffShell } from "@/components/layout/StaffShell";
import { PermissionsProvider } from "@/lib/hooks/usePermissions";
import { getSessionContext } from "@/lib/auth/session";
import { homeForRole } from "@/lib/rbac";
import { canAccessModule, isMasterAdminRole, type ModuleId } from "@/lib/permissions";
import type { SessionContext, UiRole } from "@/lib/types/domain";

export async function requireSession(): Promise<SessionContext> {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  return session;
}

export async function requireRole(role: UiRole) {
  const session = await requireSession();
  if (session.uiRole !== role && !isMasterAdminRole(session.uiRole)) {
    redirect(homeForRole(session.uiRole, session.permissions));
  }
  return session;
}

export async function requireStaff() {
  const session = await requireSession();
  if (session.uiRole === "patient") redirect("/paciente");
  return session;
}

export async function requireModule(moduleId: ModuleId) {
  const session = await requireStaff();
  if (!canAccessModule(session.uiRole, session.permissions, moduleId)) {
    redirect(homeForRole(session.uiRole, session.permissions));
  }
  return session;
}

export async function StaffAppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaff();
  return (
    <PermissionsProvider session={session}>
      <StaffShell session={session}>{children}</StaffShell>
    </PermissionsProvider>
  );
}

export async function RoleLayout({
  role,
  children,
}: {
  role: UiRole;
  children: React.ReactNode;
}) {
  if (role === "patient") {
    await requireRole("patient");
    return children;
  }
  return <StaffAppLayout>{children}</StaffAppLayout>;
}
