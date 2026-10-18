import { Suspense } from "react";
import { AgendaPage } from "@/components/attendance/AgendaPage";

export default function Page() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-lotus-600">Carregando agenda…</p>}>
      <AgendaPage />
    </Suspense>
  );
}
