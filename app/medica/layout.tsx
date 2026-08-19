import { RoleLayout } from "@/components/layout/RoleGate";

export default function MedicaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleLayout role="physician">{children}</RoleLayout>;
}
