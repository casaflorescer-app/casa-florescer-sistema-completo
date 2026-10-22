import { requireModule } from "@/components/layout/RoleGate";

export default async function SecretariaAgendaPage() {
  await requireModule("agenda");
  return (
    <div>
      <h1 className="page-title">Agenda dinâmica</h1>
      <p className="page-sub">
        Respeita o teto da médica (consulta vs procedimento) e o bloqueio de
        sala. Encaixe só com autorização.
      </p>
      <div className="card mt-6">
        <p className="text-sm text-lotus-600">Hoje · 19/08/2026</p>
        <ul className="mt-3 divide-y divide-lotus-100 text-sm">
          <li className="flex justify-between py-2">
            <span>08:00 Helena Dias · consulta</span>
            <span className="text-lotus-600">Sala 1</span>
          </li>
          <li className="flex justify-between py-2">
            <span>10:30 DIU · procedimento</span>
            <span className="text-lotus-600">Sala 1</span>
          </li>
          <li className="flex justify-between py-2 text-lotus-500">
            <span>14:00–18:00 bloqueado — parto</span>
            <span>reagendar</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
