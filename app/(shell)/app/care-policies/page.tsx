import { CarePolicyList } from "@/components/policies/CarePolicyList";
import { AdminSubnav } from "@/components/clinic-admin/AdminSubnav";
import { HubBackLink } from "@/components/ui/HubBackLink";

export default function CarePoliciesPage() {
  return (
    <div>
      <HubBackLink href="/app/admin" label="Voltar para Administração" />
      <AdminSubnav active="policies" />
      <CarePolicyList />
    </div>
  );
}
