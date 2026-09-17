import { StaffAppLayout } from "@/components/layout/RoleGate";
import { requireAppRouteAccess } from "@/lib/auth/require-app-route";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // B3.4.1 — autorização server-side (mesmas regras de canAccessAppPath / PATH_RULES).
  // Client ACL (AppRouteGuard) e RLS/RPC permanecem.
  await requireAppRouteAccess();
  return <StaffAppLayout>{children}</StaffAppLayout>;
}
