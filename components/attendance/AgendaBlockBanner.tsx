"use client";

import {
  AGENDA_BLOCK_REASON_LABEL,
  type AgendaBlockRow,
} from "@/lib/attendance/directory";
import { formatClock } from "@/components/attendance/agenda-display";

export function AgendaBlockBanner({
  block,
  professionalName,
  affectedCount,
  firstPredictedStartsAt,
  onViewImpact,
  onCancelBlock,
  busy,
}: {
  block: AgendaBlockRow;
  professionalName: string | null;
  affectedCount: number;
  firstPredictedStartsAt: string | null;
  onViewImpact: () => void;
  onCancelBlock?: () => void;
  busy?: boolean;
}) {
  return (
    <section className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-800">
        Alteração na agenda
      </p>
      <p className="mt-1 text-sm font-semibold text-amber-950">
        {professionalName ?? "Recurso"} · Bloqueio {formatClock(block.startsAt)}–
        {formatClock(block.endsAt)}
      </p>
      <p className="mt-1 text-sm text-amber-900">
        {AGENDA_BLOCK_REASON_LABEL[block.reasonCode]} · {affectedCount}{" "}
        {affectedCount === 1 ? "paciente afetada" : "pacientes afetadas"}
        {firstPredictedStartsAt
          ? ` · Primeira previsão: ${formatClock(firstPredictedStartsAt)}`
          : null}
      </p>
      <div className="mt-2 flex flex-wrap gap-3">
        <button
          type="button"
          className="text-sm font-semibold text-amber-950 underline-offset-2 hover:underline"
          onClick={onViewImpact}
        >
          Ver impacto
        </button>
        {onCancelBlock ? (
          <button
            type="button"
            className="text-sm font-semibold text-amber-900 underline-offset-2 hover:underline disabled:opacity-50"
            disabled={busy}
            onClick={onCancelBlock}
          >
            Cancelar bloqueio
          </button>
        ) : null}
      </div>
    </section>
  );
}
