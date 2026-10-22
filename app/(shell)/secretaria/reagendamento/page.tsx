"use client";

import { useAlerts } from "@/components/alerts/AlertProvider";

const affected = [
  "Marina Alves · 14:00",
  "Rita Lopes · 15:00",
  "Paula Ferreira · 16:00",
  "Sofia Martins · 16:40",
  "Ana Beatriz · 17:20",
  "Lúcia Ramos · 18:00",
];

export default function ReagendamentoPage() {
  const { pushAlert } = useAlerts();

  function confirmMass() {
    pushAlert({
      id: `mass-${Date.now()}`,
      organization_id: "org",
      practice_id: "preview-house",
      appointment_id: null,
      audience: "all_staff",
      severity: "warning",
      title: "Reagendamento em massa enviado",
      body: "6 pacientes da tarde foram avisadas por WhatsApp. Confira pendências de resposta.",
      created_at: new Date().toISOString(),
      acknowledged_at: null,
    });
  }

  return (
    <div>
      <h1 className="page-title">Reagendamento em massa</h1>
      <p className="page-sub">
        Use quando a médica sair para parto ou emergência. Uma ação avisa todas
        e libera a sala.
      </p>
      <div className="card mt-6">
        <p className="text-sm font-medium">Pacientes da tarde — Dra. Samara</p>
        <ul className="mt-3 space-y-1 text-sm text-lotus-800">
          {affected.map((row) => (
            <li key={row}>{row}</li>
          ))}
        </ul>
        <label className="mt-4 block text-sm">
          Novo dia
          <input type="date" className="mt-1 w-full rounded-xl border border-lotus-200 px-3 py-2" />
        </label>
        <button
          type="button"
          onClick={confirmMass}
          className="mt-4 rounded-xl bg-lotus-700 px-4 py-2 text-sm font-semibold text-white"
        >
          Remarcar e avisar
        </button>
      </div>
    </div>
  );
}
