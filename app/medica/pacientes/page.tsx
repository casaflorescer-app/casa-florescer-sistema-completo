import { requireModule } from "@/components/layout/RoleGate";
import { PhysicianPatients } from "@/components/patients/PhysicianPatients";

export default async function MeusPacientesPage() {
  await requireModule("pacientes");
  return (
    <div>
      <h1 className="page-title">Meus Pacientes</h1>
      <p className="page-sub">
        GPA, DPP e alergias ficam em evidência para a consulta. Abra o prontuário
        para o histórico obstétrico isolado desta prática.
      </p>
      <PhysicianPatients />
    </div>
  );
}
