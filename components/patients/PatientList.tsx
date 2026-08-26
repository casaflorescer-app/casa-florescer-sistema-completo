"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

export function PatientList() {
  const router = useRouter();
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
                <Link href={`/app/patients/${row.id}`} className="card block hover:border-lotus-200">
                <p className="font-semibold text-lotus-900">{row.fullName}</p>
                {row.socialName ? (
                  <p className="mt-0.5 text-sm text-lotus-600">{row.socialName}</p>
                ) : null}
                <dl className="mt-3 grid gap-2 text-sm text-lotus-800">
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
                    <dt className="text-xs uppercase tracking-wide text-lotus-500">E-mail</dt>
                    <dd className="break-all">{row.email ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-lotus-500">Cadastro</dt>
                    <dd>{formatDateTime(row.createdAt)}</dd>
                  </div>
                </dl>
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-6 hidden overflow-x-auto rounded-2xl border border-lotus-100 bg-white md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-lotus-100 text-xs uppercase tracking-wide text-lotus-500">
                <tr>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">CPF</th>
                  <th className="px-4 py-3">Nascimento</th>
                  <th className="px-4 py-3">Telefone</th>
                  <th className="px-4 py-3">E-mail</th>
                  <th className="px-4 py-3">Cadastro</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-b border-lotus-50 align-top hover:bg-lotus-50/70"
                    onClick={() => router.push(`/app/patients/${row.id}`)}
                  >
                    <td className="px-4 py-3">
                      <Link href={`/app/patients/${row.id}`} className="block hover:text-lotus-700">
                        <p className="font-medium text-lotus-900">{row.fullName}</p>
                        {row.socialName ? (
                          <p className="mt-0.5 text-xs text-lotus-600">{row.socialName}</p>
                        ) : null}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{maskCpf(row.cpf)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {row.birthDate ? formatIsoDateBr(row.birthDate) : "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {row.phone ? formatPhone(row.phone) : "—"}
                    </td>
                    <td className="px-4 py-3">{row.email ?? "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
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
