"use client";

import { useState } from "react";
import {
  AGENDA_BLOCK_REASON_LABEL,
  type AgendaBlockRow,
} from "@/lib/attendance/directory";
import { formatClock } from "@/components/attendance/agenda-display";

export function AgendaBlockCard({
  block,
  professionalName,
  roomName,
  affectedCount,
}: {
  block: AgendaBlockRow;
  professionalName: string | null;
  roomName: string | null;
  affectedCount: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <article className="rounded-md border border-dashed border-amber-400 bg-amber-50/80 px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-800">
        Bloqueio operacional
      </p>
      <p className="mt-1 text-sm font-semibold text-amber-950">
        {professionalName ?? roomName ?? "Recurso"}
      </p>
      <p className="text-sm text-amber-900">
        {formatClock(block.startsAt)} — {formatClock(block.endsAt)} ·{" "}
        {AGENDA_BLOCK_REASON_LABEL[block.reasonCode]}
      </p>
      <p className="mt-1 text-xs text-amber-900">
        {affectedCount} {affectedCount === 1 ? "atendimento afetado" : "atendimentos afetados"}
      </p>
      <button
        type="button"
        className="mt-1 text-xs font-semibold text-amber-950 underline-offset-2 hover:underline"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Ocultar detalhes" : "Ver detalhes"}
      </button>
      {open ? (
        <p className="mt-2 text-xs text-amber-900">
          {block.description?.trim() || "Sem observação operacional."}
          {block.recordedAfterStart ? " · Registrado após o início." : null}
          {" · "}Status: {block.status}
        </p>
      ) : null}
    </article>
  );
}
