import { RentalsModule } from "@/components/rentals/RentalsModule";

export default function RentalsPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  const tab =
    searchParams?.tab === "contracts" || searchParams?.tab === "contratos"
      ? "contracts"
      : "dashboard";
  return <RentalsModule initialTab={tab} />;
}
