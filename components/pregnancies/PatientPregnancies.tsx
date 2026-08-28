"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatIsoDateBr } from "@/lib/patients/format";
import {
  effectiveEdd,
  listPatientPregnancies,
  pregnancyLabel,
  PREGNANCY_STATUS_LABEL,
  type PregnancyRow,
} from "@/lib/pregnancies/directory";
import { buttonClass } from "@/components/platform/Ui";

export function PatientPregnancies({ patientId }: { patientId: string }) {
  const [rows, setRows] = useState<PregnancyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setError("Autenticação não configurada neste ambiente.");
      setLoading(false);
      return;
    }
    void listPatientPregnancies(supabase, patientId)
      .then((data) => {
        setRows(data);
        setError(null);
      })
      .catch((err: unknown) => {
        setRows([]);
        setError(err instanceof Error ? err.message : "Não foi possível carregar as gestações.");
      })
      .finally(() => setLoading(false));
  }, [patientId]);

  const hasActive = rows.some((row) => row.status === "in_care");

  return (
    <section className="card mt-6 max-w-xl md:max-w-4xl" aria-labelledby="patient-pregnancies-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="patient-pregnancies-title" className="font-semibold text-lotus-900">
            Gestações
          </h2>
          <p className="mt-1 text-sm text-lotus-600">
            Cada gestação é um episódio independente. Não faz parte do cadastro permanente.
          </p>
        </div>
        <Link
          href={`/app/patients/${patientId}/pregnancies/new`}
          className={`${buttonClass} inline-flex items-center`}
        >
          + Nova gestação
        </Link>
      </div>

      {error ? (
        <p className="mt-4 text-sm text-rose-800" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? <p className="mt-4 text-sm text-lotus-600">Carregando gestações…</p> : null}

      {!loading && !error && rows.length === 0 ? (
        <p className="mt-4 text-sm text-lotus-600">Nenhuma gestação registrada.</p>
      ) : null}

      {!loading && rows.length > 0 ? (
        <>
          {hasActive ? (
            <p className="mt-3 text-xs text-lotus-500">
              Há uma gestação em acompanhamento. Encerrar a atual é necessário para iniciar outra.
            </p>
          ) : null}

          <ul className="mt-4 space-y-3 md:hidden">
            {rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/app/patients/${patientId}/pregnancies/${row.id}`}
                  className="block rounded-xl border border-lotus-100 p-3 hover:border-lotus-200"
                >
                  <p className="font-medium text-lotus-900">{pregnancyLabel(row)}</p>
                  <p className="mt-1 text-sm text-lotus-700">{PREGNANCY_STATUS_LABEL[row.status]}</p>
                  <dl className="mt-3 grid gap-2 text-sm text-lotus-800">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-lotus-500">Principal</dt>
                      <dd>{row.primaryName ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-lotus-500">Retaguarda</dt>
                      <dd>{row.backupName ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-lotus-500">DUM</dt>
                      <dd>{row.lmpDate ? formatIsoDateBr(row.lmpDate) : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-lotus-500">DPP</dt>
                      <dd>{effectiveEdd(row) ? formatIsoDateBr(effectiveEdd(row)!) : "—"}</dd>
                    </div>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-4 hidden overflow-x-auto rounded-xl border border-lotus-100 md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-lotus-100 text-xs uppercase tracking-wide text-lotus-500">
                <tr>
                  <th className="px-3 py-2">Gestação</th>
                  <th className="px-3 py-2">Principal</th>
                  <th className="px-3 py-2">Retaguarda</th>
                  <th className="px-3 py-2">DUM</th>
                  <th className="px-3 py-2">DPP</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-lotus-50 hover:bg-lotus-50/70">
                    <td className="px-3 py-2">
                      <Link
                        href={`/app/patients/${patientId}/pregnancies/${row.id}`}
                        className="font-medium text-lotus-900 hover:text-lotus-700"
                      >
                        {pregnancyLabel(row)}
                      </Link>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.primaryName ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.backupName ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.lmpDate ? formatIsoDateBr(row.lmpDate) : "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {effectiveEdd(row) ? formatIsoDateBr(effectiveEdd(row)!) : "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{PREGNANCY_STATUS_LABEL[row.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
