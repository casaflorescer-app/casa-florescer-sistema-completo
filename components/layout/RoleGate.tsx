import { redirect } from "next/navigation";
import { StaffShell } from "@/components/layout/StaffShell";
import { getSessionContext } from "@/lib/auth/session";
import { homeForRole } from "@/lib/rbac";
import type { UiRole } from "@/lib/types/domain";

export const dynamic = "force-dynamic";

export async function requireRole(role: UiRole) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  if (session.uiRole !== role) redirect(homeForRole(session.uiRole));
  return session;
}

export async function RoleLayout({
  role,
  children,
}: {
  role: UiRole;
  children: React.ReactNode;
}) {
  const session = await requireRole(role);
  if (role === "patient") return children;
  return <StaffShell session={session}>{children}</StaffShell>;
}
