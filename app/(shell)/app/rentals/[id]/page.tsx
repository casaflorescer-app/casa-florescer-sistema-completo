import { RentalsModule } from "@/components/rentals/RentalsModule";

export default function RentalContractDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <RentalsModule initialTab="contracts" focusContractId={params.id} />
  );
}
