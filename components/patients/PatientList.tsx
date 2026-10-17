"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { hasStaffRole } from "@/lib/auth/access";
import { formatIsoDateBr, formatPhone } from "@/lib/patients/format";
import {
  CARE_SPECIALTIES,
  listPatients,
  maskCpf,
  patientChartHref,
  searchPatients,
  type CareSpecialty,
  type PatientListRow,
} from "@/lib/patients/directory";
import { formatDateTime } from "@/lib/platform/format";
import { StatusMessage, buttonClass, fieldClass, ghostButtonClass } from "@/components/platform/Ui";
import { PatientPhotoThumb } from "@/components/patients/PatientPhotoThumb";

const FILTER_LABEL: Record<CareSpecialty | "all", string> = {
  all: "Todas",
  gynecology: "Ginecológico",
  obstetrics: "Obstétrico",
};

export function PatientList() {
  const { authorization } = useAuth();
  const canOpenChart = authorization ? hasStaffRole(authorization, "physician") : false;
  const [rows, setRows] = useState<PatientListRow[]>([]);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [specialtyFilter, setSpecialtyFilter] = useState<CareSpecialty | "all">("all");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 280);
    return () => window.clearTimeout(t);
  }, [query]);

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

  const [filtered, setFiltered] = useState<PatientListRow[]>([]);

  useEffect(() => {
    if (!debounced) {
      setFiltered(rows);
      return;
    }
    if (debounced.length < 2) {
      setFiltered([]);
      return;
    }
    const supabase = createClient();
    if (!supabase) return;
    let cancelled = false;
    setSearching(true);
    void searchPatients(supabase, debounced, { limit: 40 })
      .then((data) => {
        if (!cancelled) setFiltered(data);
      })
      .catch(() => {
        if (!cancelled) setFiltered([]);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, rows]);

  /** Especialidades presentes na massa visível — evita chips fictícios. */
  const availableSpecialties = useMemo(() => {
    const present = new Set<CareSpecialty>();
    for (const row of rows) {
      for (const item of row.careSpecialties) present.add(item);
    }
    return CARE_SPECIALTIES.filter((item) => present.has(item));
  }, [rows]);

  const displayRows = useMemo(() => {
    const base = debounced ? filtered : rows;
    if (specialtyFilter === "all") return base;
    return base.filter((row) => row.careSpecialties.includes(specialtyFilter));
  }, [debounced, filtered, rows, specialtyFilter]);

  const chipClass = (active: boolean) =>
    active
      ? `${buttonClass} inline-flex min-h-10 items-center px-3 py-1.5 text-sm`
      : `${ghostButtonClass} inline-flex min-h-10 items-center px-3 py-1.5 text-sm`;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">
        Médico
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
            {loading || searching
              ? "Carregando…"
              : `${displayRows.length} ${displayRows.length === 1 ? "paciente" : "pacientes"}`}
          </p>
          <Link href="/app/patients/new" className={`${buttonClass} inline-flex items-center`}>
            Nova paciente
          </Link>
        </div>
      </div>

      {availableSpecialties.length > 0 ? (
        <div
          className="mt-4 flex flex-wrap gap-2"
          role="group"
          aria-label="Filtrar por classificação assistencial"
        >
          <button
            type="button"
            className={chipClass(specialtyFilter === "all")}
            aria-pressed={specialtyFilter === "all"}
            onClick={() => setSpecialtyFilter("all")}
          >
            {FILTER_LABEL.all}
          </button>
          {availableSpecialties.map((item) => (
            <button
              key={item}
              type="button"
              className={chipClass(specialtyFilter === item)}
              aria-pressed={specialtyFilter === item}
              onClick={() => setSpecialtyFilter(item)}
            >
              {FILTER_LABEL[item]}
            </button>
          ))}
        </div>
      ) : null}

      {loading ? (
        <p className="mt-6 text-sm text-lotus-600">Carregando pacientes…</p>
      ) : null}

      {!loading && !error && displayRows.length === 0 ? (
        <section className="card mt-6 text-sm text-lotus-700">
          {rows.length === 0
            ? "Nenhuma paciente visível com o seu vínculo."
            : "Nenhuma paciente encontrada para esta pesquisa."}
        </section>
      ) : null}

      {!loading && displayRows.length > 0 ? (
        <>
          <ul className="mt-6 space-y-3 md:hidden">
            {displayRows.map((row) => (
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
                      <div className="mt-3 flex flex-wrap gap-3">
                        <Link
                          href={`/app/patients/${row.id}`}
                          className="inline-flex text-sm font-medium text-lotus-800 underline-offset-2 hover:underline"
                        >
                          Ver detalhes
                        </Link>
                        {canOpenChart ? (
                          <Link
                            href={patientChartHref(row.id)}
                            className="inline-flex text-sm font-semibold text-lotus-900 underline-offset-2 hover:underline"
                          >
                            Abrir prontuário
                          </Link>
                        ) : null}
                      </div>
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
                {displayRows.map((row) => (
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
                      <div className="flex flex-col items-end gap-1">
                        <Link
                          href={`/app/patients/${row.id}`}
                          className="inline-flex min-h-11 items-center text-sm font-medium text-lotus-800 underline-offset-2 hover:underline"
                        >
                          Ver detalhes
                        </Link>
                        {canOpenChart ? (
                          <Link
                            href={patientChartHref(row.id)}
                            className={`${ghostButtonClass} inline-flex min-h-11 items-center`}
                          >
                            Abrir prontuário
                          </Link>
                        ) : null}
                      </div>
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
