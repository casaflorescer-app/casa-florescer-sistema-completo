"use client";

import { useState } from "react";
import type { AppointmentPredictionView } from "@/lib/attendance/appointment-prediction";
import {
  durationSourceStaffLabel,
  formatPredictionDelta,
} from "@/lib/attendance/appointment-prediction";
import { formatClock } from "@/components/attendance/agenda-display";
const STATE_LABEL: Record<AppointmentPredictionView["state"], string> = {
  pending: "Aguardando",
  in_progress: "Em atendimento",
  completed_actual: "Encerrado (efetivo)",
  cancelled: "Cancelado",
  no_show: "Não compareceu",
};

export function AppointmentPredictionSummary({
  prediction,
}: {
  prediction: AppointmentPredictionView | null | undefined;
}) {
  const [open, setOpen] = useState(false);
  if (!prediction) return null;

  const delta = formatPredictionDelta(prediction.deltaMin);
  const deltaClass =
    delta.kind === "delay"
      ? "text-amber-800"
      : delta.kind === "early"
        ? "text-emerald-800"
        : "text-lotus-700";

  return (
    <div className="mt-3 min-w-0 rounded-md border border-lotus-100 bg-lotus-50/60 px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <p className="text-lotus-800">
          <span className="font-semibold text-lotus-500">Agendado:</span>{" "}
          {formatClock(prediction.administrativeStartsAt)}
        </p>
        <p className="text-lotus-900">
          <span className="font-semibold text-lotus-500">Previsão:</span>{" "}
          {formatClock(prediction.predictedStartsAt)}
        </p>
        {delta.kind === "delay" ? (
          <p className={`font-semibold ${deltaClass}`}>Atraso: {delta.label}</p>
        ) : null}
        {delta.kind === "early" ? (
          <p className={`font-semibold ${deltaClass}`}>Antecipação: {delta.label}</p>
        ) : null}
        {delta.kind === "on_time" ? (
          <p className={deltaClass}>Previsão no horário</p>
        ) : null}
      </div>
      {prediction.affectedByBlock ? (
        <p className="mt-1 text-xs font-semibold text-amber-900">Afetado por bloqueio operacional</p>
      ) : null}

      <button
        type="button"
        className="mt-2 text-xs font-semibold text-lotus-700 underline-offset-2 hover:underline"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Ocultar detalhes" : "Ver detalhes"}
      </button>

      {open ? (
        <dl className="mt-2 grid grid-cols-1 gap-1 text-xs text-lotus-800 sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-lotus-500">Estado</dt>
            <dd>{STATE_LABEL[prediction.state]}</dd>
          </div>
          <div>
            <dt className="font-semibold text-lotus-500">Duração estimada</dt>
            <dd>{prediction.estimatedDurationMin} min</dd>
          </div>
          <div>
            <dt className="font-semibold text-lotus-500">Fonte da duração</dt>
            <dd>{durationSourceStaffLabel(prediction.durationSource)}</dd>
          </div>
          <div>
            <dt className="font-semibold text-lotus-500">Fim previsto</dt>
            <dd>{formatClock(prediction.predictedEndsAt)}</dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}
