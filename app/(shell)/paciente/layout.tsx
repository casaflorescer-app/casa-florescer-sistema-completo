import { RoleLayout } from "@/components/layout/RoleGate";

export const dynamic = "force-dynamic";

export default function PacienteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleLayout>{children}</RoleLayout>;
}
