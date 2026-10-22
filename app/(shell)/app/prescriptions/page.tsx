import { Suspense } from "react";
import { PrescriptionsModule } from "@/components/prescriptions/PrescriptionsModule";

export default function PrescriptionsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-lotus-600">Carregando receitas…</p>}>
      <PrescriptionsModule />
    </Suspense>
  );
}
