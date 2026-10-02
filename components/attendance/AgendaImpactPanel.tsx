"use client";

import { formatClock } from "@/components/attendance/agenda-display";
import { formatPredictionDelta } from "@/lib/attendance/appointment-prediction";

export type ImpactRow = {
  appointmentId: string;
  patientName: string | null;
  administrativeStartsAt: string;
  predictedStartsAt: string;
  deltaMin: number;
};

export function AgendaImpactPanel({
  rows,
  onClose,
}: {
  rows: ImpactRow[];
  onClose: () => void;
}) {
  return (
    <section className="mt-4 overflow-x-auto rounded-md border border-lotus-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-lotus-900">Impacto do bloqueio</h2>
        <button
          type="button"
          className="text-sm font-semibold text-lotus-700 underline-offset-2 hover:underline"
          onClick={onClose}
        >
          Fechar
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-lotus-600">Nenhum atendimento pendente afetado.</p>
      ) : (
        <table className="mt-3 w-full min-w-[520px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-lotus-100 text-lotus-500">
              <th className="py-2 pr-3 font-semibold">Paciente</th>
              <th className="py-2 pr-3 font-semibold">Agendado</th>
              <th className="py-2 pr-3 font-semibold">Nova previsão</th>
              <th className="py-2 font-semibold">Impacto</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const delta = formatPredictionDelta(row.deltaMin);
              return (
                <tr key={row.appointmentId} className="border-b border-lotus-50 text-lotus-900">
                  <td className="py-2 pr-3">{row.patientName ?? "Paciente"}</td>
                  <td className="py-2 pr-3">{formatClock(row.administrativeStartsAt)}</td>
                  <td className="py-2 pr-3">{formatClock(row.predictedStartsAt)}</td>
                  <td className="py-2">{delta.kind === "on_time" ? "—" : delta.label}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
