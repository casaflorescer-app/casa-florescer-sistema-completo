import { CarePolicyDetail } from "@/components/policies/CarePolicyDetail";

export default function CarePolicyDetailPage({
  params,
  searchParams,
}: {
  params: { policyId: string };
  searchParams?: { atualizado?: string };
}) {
  return (
    <CarePolicyDetail
      policyId={params.policyId}
      updated={searchParams?.atualizado === "1"}
    />
  );
}
