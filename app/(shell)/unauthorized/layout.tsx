import { StaffAppLayout } from "@/components/layout/RoleGate";

export const dynamic = "force-dynamic";

export default function UnauthorizedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <StaffAppLayout>{children}</StaffAppLayout>;
}
