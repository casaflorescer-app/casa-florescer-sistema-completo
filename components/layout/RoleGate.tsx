import { redirect } from "next/navigation";
import { AppWorkspace } from "@/components/auth/AppRouteGuard";
import { PermissionsProvider } from "@/lib/hooks/usePermissions";
import { getSessionContext } from "@/lib/auth/session";
import type { ModuleId } from "@/lib/permissions";
import type { SessionContext, UiRole } from "@/lib/types/domain";

export async function requireSession(): Promise<SessionContext> {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  return session;
}

/** Autenticação de sessão. A autorização de rota da FASE 6 está em AppWorkspace. */
export async function requireRole(_role: UiRole) {
  return requireSession();
}

export async function requireStaff() {
  return requireSession();
}

/** Autenticação de sessão. Módulos novos usam AppRouteGuard + memberships. */
export async function requireModule(_moduleId: ModuleId) {
  return requireSession();
}

export async function StaffAppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return (
    <PermissionsProvider session={session}>
      <AppWorkspace>{children}</AppWorkspace>
    </PermissionsProvider>
  );
}

export async function RoleLayout({
  children,
}: {
  role?: UiRole;
  children: React.ReactNode;
}) {
  return <StaffAppLayout>{children}</StaffAppLayout>;
}

export async function PatientAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <StaffAppLayout>{children}</StaffAppLayout>;
}
