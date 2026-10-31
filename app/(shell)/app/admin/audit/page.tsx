import { ClinicAuditPanel } from "@/components/clinic-admin/ClinicAuditPanel";
import { AdminSubnav } from "@/components/clinic-admin/AdminSubnav";
import { HubBackLink } from "@/components/ui/HubBackLink";

export default function ClinicAuditPage() {
  return (
    <div>
      <HubBackLink href="/app/admin" label="Voltar para Administração" />
      <AdminSubnav active="audit" />
      <ClinicAuditPanel />
    </div>
  );
}
