import { requireModule } from "@/components/layout/RoleGate";
import { UserManagement } from "@/components/admin/UserManagement";
import { PREVIEW_STAFF } from "@/lib/rbac";
import { defaultModulesForRole, type ModuleId } from "@/lib/permissions";

export default async function UsuariosPage() {
  await requireModule("permissoes");
  const initialAcl: Record<string, ModuleId[]> = {};
  for (const user of PREVIEW_STAFF) {
    initialAcl[user.userId] = defaultModulesForRole(user.uiRole);
  }
  return <UserManagement users={PREVIEW_STAFF} initialAcl={initialAcl} />;
}
