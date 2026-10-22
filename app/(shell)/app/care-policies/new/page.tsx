import { RequireCarePolicyAccess } from "@/components/auth/RequireCarePolicyAccess";
import { CarePolicyForm } from "@/components/policies/CarePolicyForm";

export default function NewCarePolicyPage() {
  return (
    <RequireCarePolicyAccess mode="manage">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">
          Gestão comercial
        </p>
        <h1 className="page-title mt-1">Nova política de atendimento</h1>
        <p className="page-sub mt-2">
          Primeira versão vigente para a profissional nesta prática. Valores em reais; o banco grava
          centavos.
        </p>
        <div className="mt-6">
          <CarePolicyForm />
        </div>
      </div>
    </RequireCarePolicyAccess>
  );
}
