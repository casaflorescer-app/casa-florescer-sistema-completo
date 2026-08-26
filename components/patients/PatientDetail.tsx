"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatIsoDateBr, formatPhone } from "@/lib/patients/format";
import { getPatient, maskCpf, type PatientListRow } from "@/lib/patients/directory";
import { formatDateTime } from "@/lib/platform/format";
import { StatusMessage, buttonClass, ghostButtonClass } from "@/components/platform/Ui";

export function PatientDetail({ patientId }: { patientId: string }) {
  const [row, setRow] = useState<PatientListRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setError("Autenticação não configurada neste ambiente.");
      setLoading(false);
      return;
    }

    void getPatient(supabase, patientId)
      .then((data) => {
        if (!data) {
          setRow(null);
          setError("Paciente não encontrada ou sem permissão para visualização.");
          return;
        }
        setRow(data);
        setError(null);
      })
      .catch((err: unknown) => {
        setRow(null);
        setError(err instanceof Error ? err.message : "Paciente não encontrada ou sem permissão para visualização.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [patientId]);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">
        Clínica
      </p>
      <h1 className="page-title mt-1">{row?.fullName ?? "Paciente"}</h1>
      <p className="page-sub mt-2">Cadastro administrativo. Sem dados clínicos nesta tela.</p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/app/patients" className={`${ghostButtonClass} inline-flex items-center`}>
          Voltar para pacientes
        </Link>
        <Link href="/app/patients/new" className={`${buttonClass} inline-flex items-center`}>
          Nova paciente
        </Link>
      </div>

      <StatusMessage error={error} />

      {loading ? <p className="mt-6 text-sm text-lotus-600">Carregando paciente…</p> : null}

      {!loading && row ? (
        <section className="card mt-6 max-w-xl">
          <dl className="grid gap-4 text-sm text-lotus-800">
            <div>
              <dt className="text-xs uppercase tracking-wide text-lotus-500">Nome completo</dt>
              <dd className="mt-1 font-medium text-lotus-900">{row.fullName}</dd>
            </div>
            {row.socialName ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-lotus-500">Nome social</dt>
                <dd className="mt-1">{row.socialName}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs uppercase tracking-wide text-lotus-500">CPF</dt>
              <dd className="mt-1">{maskCpf(row.cpf)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-lotus-500">Data de nascimento</dt>
              <dd className="mt-1">{row.birthDate ? formatIsoDateBr(row.birthDate) : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-lotus-500">Telefone</dt>
              <dd className="mt-1">{row.phone ? formatPhone(row.phone) : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-lotus-500">E-mail</dt>
              <dd className="mt-1 break-all">{row.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-lotus-500">Data de cadastro</dt>
              <dd className="mt-1">{formatDateTime(row.createdAt)}</dd>
            </div>
          </dl>
        </section>
      ) : null}
    </div>
  );
}
