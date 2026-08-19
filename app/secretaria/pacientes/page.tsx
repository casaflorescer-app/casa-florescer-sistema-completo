import { requireModule } from "@/components/layout/RoleGate";

const patients = [
  { name: "Marina Alves", phone: "(11) 90000-0001", last: "Retorno anual em set/2026" },
  { name: "Carla Menezes", phone: "(11) 90000-0002", last: "Pré-natal — 38 semanas" },
  { name: "Helena Dias", phone: "(11) 90000-0003", last: "Consulta ginecológica" },
];

export default async function PacientesPage() {
  await requireModule("pacientes");
  return (
    <div>
      <h1 className="page-title">Pacientes</h1>
      <p className="page-sub">
        Cadastro da casa (MPI). O prontuário de cada médica fica na prática
        dela — aqui você vê contato e histórico de agenda.
      </p>
      <div className="mt-4 flex gap-2">
        <input
          placeholder="Buscar nome, telefone ou CPF"
          className="w-full max-w-md rounded-xl border border-lotus-200 px-3 py-2 text-sm"
        />
        <button type="button" className="rounded-xl bg-lotus-700 px-4 py-2 text-sm font-semibold text-white">
          Nova paciente
        </button>
      </div>
      <ul className="mt-6 space-y-3">
        {patients.map((patient) => (
          <li key={patient.name} className="card">
            <p className="font-semibold">{patient.name}</p>
            <p className="text-sm text-lotus-600">{patient.phone}</p>
            <p className="mt-1 text-sm text-lotus-800">{patient.last}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
