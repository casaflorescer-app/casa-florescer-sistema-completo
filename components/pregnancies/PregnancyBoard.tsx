"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatIsoDateBr } from "@/lib/patients/format";
import {
  effectiveEdd,
  listVisiblePregnancies,
  pregnancyLabel,
  PREGNANCY_STATUS_LABEL,
  type PregnancyRow,
} from "@/lib/pregnancies/directory";

export function PregnancyBoard() {
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
    void listVisiblePregnancies(supabase)
      .then((data) => {
        setRows(data);
        setError(null);
      })
      .catch((err: unknown) => {
        setRows([]);
        setError(err instanceof Error ? err.message : "Não foi possível carregar as gestações.");
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">Assistência</p>
      <h1 className="page-title mt-1">Obstetrícia</h1>
      <p className="page-sub mt-2">
        Gestações visíveis ao seu vínculo. Novos episódios são criados a partir do cadastro da paciente.
      </p>

      {error ? (
        <p className="mt-6 text-sm text-rose-800" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? <p className="mt-6 text-sm text-lotus-600">Carregando gestações…</p> : null}

      {!loading && !error && rows.length === 0 ? (
        <section className="card mt-6 text-sm text-lotus-700">
          Nenhuma gestação visível. Abra uma paciente em Clínica → Pacientes para iniciar.
        </section>
      ) : null}

      {!loading && rows.length > 0 ? (
        <>
          <ul className="mt-6 space-y-3 md:hidden">
            {rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/app/patients/${row.patientId}/pregnancies/${row.id}`}
                  className="card block hover:border-lotus-200"
                >
                  <p className="font-semibold text-lotus-900">{row.patientName ?? "Paciente"}</p>
                  <p className="mt-1 text-sm text-lotus-700">
                    {pregnancyLabel(row)} · {PREGNANCY_STATUS_LABEL[row.status]}
                  </p>
                  <p className="mt-2 text-sm text-lotus-800">{row.primaryName ?? "—"}</p>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-6 hidden overflow-x-auto rounded-2xl border border-lotus-100 bg-white md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-lotus-100 text-xs uppercase tracking-wide text-lotus-500">
                <tr>
                  <th className="px-4 py-3">Paciente</th>
                  <th className="px-4 py-3">Gestação</th>
                  <th className="px-4 py-3">Principal</th>
                  <th className="px-4 py-3">DPP</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-lotus-50 hover:bg-lotus-50/70">
                    <td className="px-4 py-3">
                      <Link
                        href={`/app/patients/${row.patientId}/pregnancies/${row.id}`}
                        className="font-medium text-lotus-900 hover:text-lotus-700"
                      >
                        {row.patientName ?? "Paciente"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{pregnancyLabel(row)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{row.primaryName ?? "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {effectiveEdd(row) ? formatIsoDateBr(effectiveEdd(row)!) : "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{PREGNANCY_STATUS_LABEL[row.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
