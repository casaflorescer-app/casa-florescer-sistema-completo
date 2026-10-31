import { SpecialtiesModule } from "@/components/clinic-mgmt/SpecialtiesModule";
import { PeopleSubnav } from "@/components/clinic/PeopleSubnav";
import { HubBackLink } from "@/components/ui/HubBackLink";

export default function SpecialtiesPage() {
  return (
    <div>
      <HubBackLink href="/app/people" label="Voltar para Pessoas" />
      <PeopleSubnav active="specialties" />
      <SpecialtiesModule />
    </div>
  );
}
