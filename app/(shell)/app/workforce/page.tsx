import { WorkforceModule } from "@/components/clinic-mgmt/WorkforceModule";
import { PeopleSubnav } from "@/components/clinic/PeopleSubnav";
import { HubBackLink } from "@/components/ui/HubBackLink";

export default function WorkforcePage() {
  return (
    <div>
      <HubBackLink href="/app/people" label="Voltar para Pessoas" />
      <PeopleSubnav active="workforce" />
      <WorkforceModule />
    </div>
  );
}
