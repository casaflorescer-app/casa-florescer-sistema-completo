import { ClinicOrganizationPanel } from "@/components/clinic-admin/ClinicOrganizationPanel";
import { AdminSubnav } from "@/components/clinic-admin/AdminSubnav";
import { HubBackLink } from "@/components/ui/HubBackLink";

export default function ClinicOrganizationPage() {
  return (
    <div>
      <HubBackLink href="/app/admin" label="Voltar para Administração" />
      <AdminSubnav active="organization" />
      <ClinicOrganizationPanel />
    </div>
  );
}
