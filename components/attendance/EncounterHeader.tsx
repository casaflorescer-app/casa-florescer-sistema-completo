import type { ReactNode } from "react";
import Link from "next/link";
import { ENCOUNTER_STATUS_LABEL, type EncounterRow } from "@/lib/attendance/directory";
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
}: {
  encounter: EncounterRow;
  patientName: string | null;
  professionalName: string | null;
  assistential?: ReactNode;
}) {
  return (
    <header className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">
            Atendimento
          </p>
          <h1 className="page-title mt-1">{patientName ?? "Paciente"}</h1>
          {encounter.practice?.name ? (
            <p className="mt-2 text-sm text-lotus-700">Prática · {encounter.practice.name}</p>
          ) : null}
          <p className="mt-1 text-sm text-lotus-700">
            {professionalName ?? "Profissional"} · {formatDateTime(encounter.createdAt)}
          </p>
          {encounter.signedAt ? (
            <p className="mt-1 text-sm text-lotus-600">
              Assinado em {formatDateTime(encounter.signedAt)}
            </p>
          ) : null}
        </div>
        <span
          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${TONE[encounter.status]}`}
        >
          {ENCOUNTER_STATUS_LABEL[encounter.status]}
        </span>
      </div>
      {assistential}
      <p className="mt-4 text-sm">
        <Link href="/app/agenda" className="text-lotus-800 underline-offset-2 hover:underline">
          Voltar para a agenda
        </Link>
      </p>
    </header>
  );
}
