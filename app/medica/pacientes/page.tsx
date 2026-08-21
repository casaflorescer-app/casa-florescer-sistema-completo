import Link from "next/link";
import { requireModule } from "@/components/layout/RoleGate";

const patients = [
  { id: "p1", name: "Carla Menezes", ob: "G2P1 · DPP 22/08 · PA controlada" },
  { id: "p2", name: "Juliana Prado", ob: "G1P0 · DPP 28/08 · HAS" },
  { id: "p3", name: "Marina Alves", ob: "G0 · retorno anual ginecológico" },
];

export default async function MeusPacientesPage() {
  await requireModule("pacientes");
  return (
    <div>
      <h1 className="page-title">Meus Pacientes</h1>
      <p className="page-sub">
        Lista da sua prática. Abra o prontuário eletrônico para o histórico
        obstétrico e as notas clínicas.
      </p>
      <ul className="mt-6 space-y-3">
        {patients.map((patient) => (
          <li key={patient.id}>
            <Link
              href={`/medica/prontuario/${patient.id}`}
              className="card block hover:border-lotus-300"
            >
              <p className="font-semibold text-lotus-900">{patient.name}</p>
              <p className="mt-1 text-sm text-lotus-600">{patient.ob}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
