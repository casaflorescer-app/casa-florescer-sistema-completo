import { AuditPanel } from "@/components/platform/AuditPanel";
import { SystemSubnav } from "@/components/platform/SystemSubnav";
import { HubBackLink } from "@/components/ui/HubBackLink";

export default function SystemAuditPage() {
  return (
    <div>
      <HubBackLink href="/app/system" label="Voltar para Plataforma" />
      <SystemSubnav active="audit" />
      <AuditPanel variant="platform" />
    </div>
  );
}
