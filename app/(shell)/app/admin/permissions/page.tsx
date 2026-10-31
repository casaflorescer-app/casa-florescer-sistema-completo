import { ClinicPermissionsPanel } from "@/components/clinic-admin/ClinicPermissionsPanel";
import { AdminSubnav } from "@/components/clinic-admin/AdminSubnav";
import { HubBackLink } from "@/components/ui/HubBackLink";

export default function ClinicPermissionsPage() {
  return (
    <div>
      <HubBackLink href="/app/admin" label="Voltar para Administração" />
      <AdminSubnav active="permissions" />
      <ClinicPermissionsPanel />
    </div>
  );
}
