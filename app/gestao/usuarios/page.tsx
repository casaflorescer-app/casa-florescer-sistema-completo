import { cookies } from "next/headers";
import { requireModule } from "@/components/layout/RoleGate";
import { UserManagement } from "@/components/admin/UserManagement";
import { PREVIEW_ACL_COOKIE, PREVIEW_STAFF } from "@/lib/rbac";
import { defaultModulesForRole, normalizeModules, type ModuleId } from "@/lib/permissions";

export default async function UsuariosPage() {
  await requireModule("permissoes");
  const raw = cookies().get(PREVIEW_ACL_COOKIE)?.value;
  let stored: Record<string, ModuleId[]> = {};
  if (raw) {
    try {
      stored = JSON.parse(raw) as Record<string, ModuleId[]>;
    } catch {
      stored = {};
    }
  }
  const initialAcl: Record<string, ModuleId[]> = {};
  for (const user of PREVIEW_STAFF) {
    initialAcl[user.userId] = normalizeModules(
      stored[user.userId],
      defaultModulesForRole(user.uiRole),
    );
  }
  return <UserManagement users={PREVIEW_STAFF} initialAcl={initialAcl} />;
}
