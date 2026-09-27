"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatIsoDateBr, formatPhone } from "@/lib/patients/format";
import {
  listPatients,
  maskCpf,
  matchesPatientQuery,
  type PatientListRow,
} from "@/lib/patients/directory";
import { formatDateTime } from "@/lib/platform/format";
import { StatusMessage, buttonClass, fieldClass } from "@/components/platform/Ui";
import { PatientPhotoThumb } from "@/components/patients/PatientPhotoThumb";

export function PatientList() {
  const [rows, setRows] = useState<PatientListRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setError("Autenticação não configurada neste ambiente.");
      setLoading(false);
      return;
    }

    void listPatients(supabase)
      .then((data) => {
        setRows(data);
        setError(null);
      })
      .catch((err: unknown) => {
        setRows([]);
        setError(err instanceof Error ? err.message : "Não foi possível carregar as pacientes.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(
    () => rows.filter((row) => matchesPatientQuery(row, query)),
    [rows, query],
  );

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">
        Clínica
      </p>
      <h1 className="page-title mt-1">Pacientes</h1>
      <p className="page-sub mt-2">Cadastro e identificação das pacientes</p>

      <StatusMessage error={error} />

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          className={`${fieldClass} mt-0 max-w-md`}
          placeholder="Pesquisar nome, telefone ou CPF"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Pesquisar pacientes"
        />
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-lotus-600">
            {loading
              ? "Carregando…"
              : `${filtered.length} ${filtered.length === 1 ? "paciente" : "pacientes"}`}
          </p>
          <Link href="/app/patients/new" className={`${buttonClass} inline-flex items-center`}>
            Nova paciente
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-lotus-600">Carregando pacientes…</p>
      ) : null}

      {!loading && !error && filtered.length === 0 ? (
        <section className="card mt-6 text-sm text-lotus-700">
          {rows.length === 0
            ? "Nenhuma paciente visível com o seu vínculo."
            : "Nenhuma paciente encontrada para esta pesquisa."}
        </section>
      ) : null}

      {!loading && filtered.length > 0 ? (
        <>
          <ul className="mt-6 space-y-3 md:hidden">
            {filtered.map((row) => (
              <li key={row.id}>
                <article className="card">
                  <div className="flex gap-3">
                    <div className="pt-0.5">
                      <PatientPhotoThumb photoPath={row.photoPath} patientName={row.fullName} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-lotus-900">{row.fullName}</p>
                      {row.socialName ? (
                        <p className="mt-0.5 text-sm text-lotus-600">{row.socialName}</p>
                      ) : null}
                      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm text-lotus-800">
                        <div>
                          <dt className="text-xs uppercase tracking-wide text-lotus-500">CPF</dt>
                          <dd>{maskCpf(row.cpf)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase tracking-wide text-lotus-500">Nascimento</dt>
                          <dd>{row.birthDate ? formatIsoDateBr(row.birthDate) : "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase tracking-wide text-lotus-500">Telefone</dt>
                          <dd>{row.phone ? formatPhone(row.phone) : "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase tracking-wide text-lotus-500">Cadastro</dt>
                          <dd>{formatDateTime(row.createdAt)}</dd>
                        </div>
                        <div className="col-span-2">
                          <dt className="text-xs uppercase tracking-wide text-lotus-500">E-mail</dt>
                          <dd className="break-all">{row.email ?? "—"}</dd>
                        </div>
                      </dl>
                      <Link
                        href={`/app/patients/${row.id}`}
                        className="mt-3 inline-flex text-sm font-medium text-lotus-800 underline-offset-2 hover:underline"
                      >
                        Ver detalhes
                      </Link>
                    </div>
                  </div>
                </article>
              </li>
            ))}
          </ul>

          <div className="mt-6 hidden min-w-0 max-w-full overflow-x-auto rounded-2xl border border-lotus-100 bg-white md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-lotus-100 text-xs uppercase tracking-wide text-lotus-500">
                <tr>
                  <th className="px-3 py-3">Foto</th>
                  <th className="px-3 py-3">Nome</th>
                  <th className="px-3 py-3">CPF</th>
                  <th className="px-3 py-3">Nascimento</th>
                  <th className="px-3 py-3">Telefone</th>
                  <th className="hidden px-3 py-3 xl:table-cell">E-mail</th>
                  <th className="hidden px-3 py-3 xl:table-cell">Cadastro</th>
                  <th className="whitespace-nowrap px-3 py-3">Ação</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="border-b border-lotus-50 align-top hover:bg-lotus-50/70">
                    <td className="px-3 py-3">
                      <PatientPhotoThumb photoPath={row.photoPath} patientName={row.fullName} />
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/app/patients/${row.id}`} className="block hover:text-lotus-700">
                        <p className="font-medium text-lotus-900">{row.fullName}</p>
                        {row.socialName ? (
                          <p className="mt-0.5 text-xs text-lotus-600">{row.socialName}</p>
                        ) : null}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">{maskCpf(row.cpf)}</td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {row.birthDate ? formatIsoDateBr(row.birthDate) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {row.phone ? formatPhone(row.phone) : "—"}
                    </td>
                    <td className="hidden max-w-[16rem] px-3 py-3 xl:table-cell">
                      <span className="block truncate" title={row.email ?? undefined}>
                        {row.email ?? "—"}
                      </span>
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-3 xl:table-cell">
                      {formatDateTime(row.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">
                      <Link
                        href={`/app/patients/${row.id}`}
                        className="inline-flex min-h-11 items-center text-sm font-medium text-lotus-800 underline-offset-2 hover:underline"
                      >
                        Ver detalhes
                      </Link>
                    </td>
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
