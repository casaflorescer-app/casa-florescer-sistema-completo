import { requireModule } from "@/components/layout/RoleGate";

const contracts = [
  { room: "Sala 3", who: "Consultório locatário A", model: "Fixo mensal", until: "31/12/2026" },
  { room: "Sala 4", who: "Consultório locatário B", model: "Por hora", until: "30/06/2027" },
  { room: "Sala 5", who: "Consultório locatário C", model: "Híbrido", until: "31/03/2027" },
];

export default async function ContratosPage() {
  await requireModule("contratos");
  return (
    <div>
      <h1 className="page-title">Contratos de sublocação</h1>
      <p className="page-sub">
        Cada contrato amarra sala, prática e modelo de ocupação da casa.
      </p>
      <ul className="mt-6 space-y-3">
        {contracts.map((row) => (
          <li key={row.room} className="card">
            <p className="font-semibold">{row.room} · {row.who}</p>
            <p className="mt-1 text-sm text-lotus-600">
              {row.model} · até {row.until}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
