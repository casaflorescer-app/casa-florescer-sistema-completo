import { ClinicUsersPanel } from "@/components/clinic-admin/ClinicUsersPanel";
import { AdminSubnav } from "@/components/clinic-admin/AdminSubnav";
import { HubBackLink } from "@/components/ui/HubBackLink";

export default function ClinicUsersPage() {
  return (
    <div>
      <HubBackLink href="/app/admin" label="Voltar para Administração" />
      <AdminSubnav active="users" />
      <ClinicUsersPanel />
    </div>
  );
}
