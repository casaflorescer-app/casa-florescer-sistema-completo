import { RoleLayout } from "@/components/layout/RoleGate";

export const dynamic = "force-dynamic";

export default function GestaoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleLayout role="manager">{children}</RoleLayout>;
}
