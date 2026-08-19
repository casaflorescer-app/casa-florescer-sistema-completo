import { RoleLayout } from "@/components/layout/RoleGate";

export default function SecretariaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleLayout role="secretary">{children}</RoleLayout>;
}
