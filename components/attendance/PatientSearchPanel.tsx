"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatIsoDateBr, formatPhone } from "@/lib/patients/format";
import {
  maskCpf,
  patientChartHref,
  searchPatients,
  type PatientListRow,
} from "@/lib/patients/directory";
import { buttonClass, fieldClass, ghostButtonClass } from "@/components/platform/Ui";

/**
 * C040.10 — pesquisa de pacientes (somente identificação cadastral).
 * Resultados → prontuário centrado na paciente (mesma rota oficial).
 */
export function PatientSearchPanel({
  supabase,
  title = "Pesquisar paciente",
  hint = "Busque por nome, CPF ou telefone. A lista não exibe dados clínicos.",
  actionLabel = "Abrir prontuário",
  excludePatientId,
  autoFocus = false,
  onSelectPatient,
}: {
  supabase: SupabaseClient;
  title?: string;
  hint?: string;
  actionLabel?: string;
  excludePatientId?: string;
  autoFocus?: boolean;
  /** Quando informado, a ação seleciona a paciente (não navega ao prontuário). */
  onSelectPatient?: (row: PatientListRow) => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [rows, setRows] = useState<PatientListRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 280);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (debounced.length < 2) {
      setRows([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setBusy(true);
    void searchPatients(supabase, debounced, { limit: 30 })
      .then((data) => {
        if (cancelled) return;
        setRows(
          excludePatientId ? data.filter((item) => item.id !== excludePatientId) : data,
        );
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRows([]);
        setError(err instanceof Error ? err.message : "Não foi possível pesquisar pacientes.");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, excludePatientId, supabase]);

  const emptyHint = useMemo(() => {
    if (debounced.length < 2) return "Digite ao menos 2 caracteres.";
    if (busy) return "Pesquisando…";
    return "Nenhuma paciente encontrada no seu escopo autorizado.";
  }, [busy, debounced]);

  return (
    <section className="card" aria-labelledby="patient-search-title">
      <h2 id="patient-search-title" className="text-base font-semibold text-lotus-900">
        {title}
      </h2>
      <p className="mt-1 text-sm text-lotus-600">{hint}</p>
      <label className="mt-3 block text-sm text-lotus-800">
        <span className="sr-only">Pesquisar paciente</span>
        <input
          className={`${fieldClass} mt-0`}
          placeholder="Nome, CPF ou telefone"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus={autoFocus}
          autoComplete="off"
          aria-label="Pesquisar paciente"
        />
      </label>
      {error ? <p className="mt-2 text-sm text-rose-800">{error}</p> : null}
      {debounced.length >= 2 && rows.length === 0 && !error ? (
        <p className="mt-3 text-sm text-lotus-600">{emptyHint}</p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-lotus-100 bg-white px-3 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-lotus-950">{row.fullName}</p>
                {row.socialName ? (
                  <p className="text-xs text-lotus-600">{row.socialName}</p>
                ) : null}
                <p className="mt-1 text-xs text-lotus-600">
                  Nascimento: {row.birthDate ? formatIsoDateBr(row.birthDate) : "—"}
                  {" · "}
                  CPF: {maskCpf(row.cpf)}
                  {row.phone ? ` · ${formatPhone(row.phone)}` : ""}
                </p>
              </div>
              {onSelectPatient ? (
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => onSelectPatient(row)}
                >
                  {actionLabel}
                </button>
              ) : (
                <Link href={patientChartHref(row.id)} className={buttonClass}>
                  {actionLabel}
                </Link>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {query ? (
        <button
          type="button"
          className={`${ghostButtonClass} mt-3`}
          onClick={() => {
            setQuery("");
            setDebounced("");
            setRows([]);
          }}
        >
          Limpar pesquisa
        </button>
      ) : null}
    </section>
  );
}
