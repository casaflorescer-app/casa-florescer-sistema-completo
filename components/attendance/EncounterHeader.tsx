import type { ReactNode } from "react";
import Link from "next/link";
import { ENCOUNTER_STATUS_LABEL, type EncounterRow } from "@/lib/attendance/directory";
import { patientChartHref } from "@/lib/patients/directory";
import { formatDateTime } from "@/lib/platform/format";

const TONE: Record<EncounterRow["status"], string> = {
  open: "border-lotus-300 bg-lotus-100 text-lotus-900",
  signed: "border-lotus-800 bg-lotus-800 text-white",
  amended: "border-lotus-200 bg-lotus-50 text-lotus-800",
  cancelled: "border-rose-100 bg-white text-rose-700",
};

export function EncounterHeader({
  encounter,
  patientName,
  professionalName,
  assistential,
  attendanceEnded = false,
  draftHint = false,
}: {
  encounter: EncounterRow;
  patientName: string | null;
  professionalName: string | null;
  assistential?: ReactNode;
  attendanceEnded?: boolean;
  draftHint?: boolean;
}) {
  const operationalLabel = attendanceEnded
    ? "Encerrado"
    : encounter.status === "open"
      ? draftHint
        ? "Rascunho"
        : "Em atendimento"
      : ENCOUNTER_STATUS_LABEL[encounter.status];

  return (
    <header className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">
            {encounter.returnOfEncounterId ? "Retorno" : "Atendimento"}
          </p>
          <h1 className="page-title mt-1">{patientName ?? "Paciente"}</h1>
          {encounter.practice?.name ? (
            <p className="mt-2 text-sm text-lotus-700">Prática · {encounter.practice.name}</p>
          ) : null}
          <p className="mt-1 text-sm text-lotus-700">
            {professionalName ?? "Profissional"} · {formatDateTime(encounter.createdAt)}
          </p>
          {encounter.returnOfEncounterId ? (
            <p className="mt-1 text-sm text-lotus-600">
              Retorno vinculado a atendimento anterior ·{" "}
              <Link
                href={`/app/records/${encounter.returnOfEncounterId}`}
                className="underline-offset-2 hover:underline"
              >
                ver origem
              </Link>
            </p>
          ) : null}
          {encounter.signedAt ? (
            <p className="mt-1 text-sm text-lotus-600">
              Assinado em {formatDateTime(encounter.signedAt)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {encounter.returnOfEncounterId ? (
            <span className="inline-flex rounded-full border border-lotus-300 bg-lotus-50 px-3 py-1 text-xs font-semibold text-lotus-800">
              Retorno
            </span>
          ) : null}
          <span
            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${TONE[encounter.status]}`}
          >
            {ENCOUNTER_STATUS_LABEL[encounter.status]}
          </span>
          <span className="inline-flex rounded-full border border-lotus-200 bg-white px-3 py-1 text-xs font-semibold text-lotus-800">
            {operationalLabel}
          </span>
        </div>
      </div>
      {assistential}
      <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link href="/app/agenda" className="text-lotus-800 underline-offset-2 hover:underline">
          Voltar para a agenda
        </Link>
        <Link
          href={patientChartHref(encounter.patientId)}
          className="text-lotus-800 underline-offset-2 hover:underline"
        >
          Prontuário da paciente
        </Link>
        <Link href="/app/records" className="text-lotus-800 underline-offset-2 hover:underline">
          Índice do prontuário
        </Link>
      </p>
    </header>
  );
}
