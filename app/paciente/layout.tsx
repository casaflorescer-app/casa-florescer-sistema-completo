import { PortalShell } from "@/components/layout/PortalShell";
import { requireRole } from "@/components/layout/RoleGate";

export default async function PacienteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("patient");
  return <PortalShell session={session}>{children}</PortalShell>;
}
