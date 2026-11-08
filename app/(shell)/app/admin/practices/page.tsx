import { ClinicPracticesPanel } from "@/components/clinic-admin/ClinicPracticesPanel";
import { AdminSubnav } from "@/components/clinic-admin/AdminSubnav";
import { HubBackLink } from "@/components/ui/HubBackLink";

export default function ClinicPracticesPage() {
  return (
    <div>
      <HubBackLink href="/app/admin" label="Voltar para Administração" />
      <AdminSubnav active="practices" />
      <ClinicPracticesPanel />
    </div>
  );
}
