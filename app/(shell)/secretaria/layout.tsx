import { RoleLayout } from "@/components/layout/RoleGate";

export const dynamic = "force-dynamic";

export default function SecretariaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleLayout role="secretary">{children}</RoleLayout>;
}
