"use client";

import { PatientRegistrationForm } from "@/components/patients/PatientRegistrationForm";
import { usePermissions } from "@/lib/hooks/usePermissions";

export default function PacienteCadastroPage() {
  const { session } = usePermissions();
  return (
    <div>
      <h1 className="page-title">Atualizar cadastro</h1>
      <p className="page-sub">
        Confira identidade, contato e convênio. O histórico clínico é preenchido
        pela clínica na ficha de admissão.
      </p>
      <div className="mt-6">
        <PatientRegistrationForm patientId={session.patientId ?? "preview-patient"} variant="portal" />
      </div>
    </div>
  );
}
