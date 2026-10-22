import { requireModule } from "@/components/layout/RoleGate";
import { PatientsDirectory } from "@/components/patients/PatientsDirectory";

export default async function PacientesPage() {
  await requireModule("pacientes");
  return <PatientsDirectory />;
}
