import { ProfessionalsBoard } from "@/components/clinic/ProfessionalsBoard";
import { PeopleSubnav } from "@/components/clinic/PeopleSubnav";
import { HubBackLink } from "@/components/ui/HubBackLink";

export default function ProfessionalsPage() {
  return (
    <div>
      <HubBackLink href="/app/people" label="Voltar para Pessoas" />
      <PeopleSubnav active="professionals" />
      <ProfessionalsBoard />
    </div>
  );
}
