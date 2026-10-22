import { requireModule } from "@/components/layout/RoleGate";
import { UserManagement } from "@/components/admin/UserManagement";

export default async function UsuariosPage() {
  await requireModule("permissoes");
  return <UserManagement />;
}
