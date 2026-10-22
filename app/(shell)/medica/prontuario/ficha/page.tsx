"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ClinicalSnapshot } from "@/components/patients/ClinicalSnapshot";

function FichaInner() {
  const id = useSearchParams().get("id") ?? "";
  if (!id) {
    return <p className="text-sm text-lotus-600">Selecione uma paciente na lista.</p>;
  }
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">
        Prontuário · GO
      </p>
      <h1 className="page-title">Histórico obstétrico</h1>
      <p className="page-sub">Prática isolada · notas clínicas não aparecem na recepção.</p>
      <div className="mt-6">
        <ClinicalSnapshot patientId={id} />
      </div>
    </div>
  );
}

export default function ProntuarioFichaPage() {
  return (
    <Suspense fallback={<p className="text-sm text-lotus-600">Carregando ficha…</p>}>
      <FichaInner />
    </Suspense>
  );
}
