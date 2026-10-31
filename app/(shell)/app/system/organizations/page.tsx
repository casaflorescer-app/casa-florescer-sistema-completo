import { OrganizationsPanel } from "@/components/platform/OrganizationsPanel";
import { SystemSubnav } from "@/components/platform/SystemSubnav";
import { HubBackLink } from "@/components/ui/HubBackLink";

export default function SystemOrganizationsPage() {
  return (
    <div>
      <HubBackLink href="/app/system" label="Voltar para Plataforma" />
      <SystemSubnav active="organizations" />
      <OrganizationsPanel />
    </div>
  );
}
