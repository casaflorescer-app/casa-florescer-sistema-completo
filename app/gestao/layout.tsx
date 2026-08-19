import { RoleLayout } from "@/components/layout/RoleGate";

export default function GestaoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleLayout role="manager">{children}</RoleLayout>;
}
