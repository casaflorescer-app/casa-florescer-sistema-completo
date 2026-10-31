import { InventoryModule } from "@/components/inventory/InventoryModule";

export default function InventoryItemPage({
  params,
}: {
  params: { id: string };
}) {
  return <InventoryModule initialTab="items" focusItemId={params.id} />;
}
