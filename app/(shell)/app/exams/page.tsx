import { Suspense } from "react";
import { ExamsModule } from "@/components/exams/ExamsModule";

export default function ExamsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-lotus-600">Carregando exames…</p>}>
      <ExamsModule />
    </Suspense>
  );
}
