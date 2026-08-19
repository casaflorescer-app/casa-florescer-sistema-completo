import { redirect } from "next/navigation";
import { requireStaff } from "@/components/layout/RoleGate";
import { homeForRole } from "@/lib/rbac";

export default async function GestaoHomePage() {
  const session = await requireStaff();
  redirect(homeForRole(session.uiRole, session.permissions));
}
