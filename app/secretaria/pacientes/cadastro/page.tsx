"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PatientRegistrationForm } from "@/components/patients/PatientRegistrationForm";

function CadastroInner() {
  const params = useSearchParams();
  const id = params.get("id") ?? undefined;
  return (
    <div>
      <h1 className="page-title">{id ? "Editar paciente" : "Cadastro completo"}</h1>
      <p className="page-sub">
        Três passos: identidade, faturamento e histórico clínico GO. A idade e a
        DPP são calculadas automaticamente.
      </p>
      <div className="mt-6">
        <PatientRegistrationForm patientId={id} variant="staff" />
      </div>
    </div>
  );
}

export default function CadastroPacientePage() {
  return (
    <Suspense fallback={<p className="text-sm text-lotus-600">Carregando ficha…</p>}>
      <CadastroInner />
    </Suspense>
  );
}
