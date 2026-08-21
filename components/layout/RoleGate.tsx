import {
  ClientPatientGate,
  ClientStaffGate,
} from "@/components/layout/StaticAuthGates";
import { previewSession } from "@/lib/rbac";
import type { ModuleId } from "@/lib/permissions";
import type { SessionContext, UiRole } from "@/lib/types/domain";

export async function requireSession(): Promise<SessionContext> {
  return previewSession("manager");
}

export async function requireRole(_role: UiRole) {
  return requireSession();
}

export async function requireStaff() {
  return requireSession();
}

export async function requireModule(_moduleId: ModuleId) {
  return requireStaff();
}

export async function StaffAppLayout({ children }: { children: React.ReactNode }) {
  return <ClientStaffGate>{children}</ClientStaffGate>;
}

export async function RoleLayout({
  children,
}: {
  role: UiRole;
  children: React.ReactNode;
}) {
  return <StaffAppLayout>{children}</StaffAppLayout>;
}

export async function PatientAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ClientPatientGate>{children}</ClientPatientGate>;
}
