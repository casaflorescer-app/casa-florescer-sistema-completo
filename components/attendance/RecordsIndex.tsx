"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { hasStaffRole } from "@/lib/auth/access";
import {
  ENCOUNTER_STATUS_LABEL,
  listOpenEncountersForProfessional,
  listRecentEncountersForProfessional,
  type EncounterRow,
} from "@/lib/attendance/directory";
import { listPatients, patientChartHref, type PatientListRow } from "@/lib/patients/directory";
import { formatDateTime } from "@/lib/platform/format";
import { PatientSearchPanel } from "@/components/attendance/PatientSearchPanel";
import { StatusMessage, buttonClass, ghostButtonClass } from "@/components/platform/Ui";

export function RecordsIndex() {
  const { authorization, authorizationLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [openRows, setOpenRows] = useState<EncounterRow[]>([]);
  const [recentRows, setRecentRows] = useState<EncounterRow[]>([]);
  const [patients, setPatients] = useState<PatientListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [practiceId, setPracticeId] = useState("");

  const physicianMemberships = useMemo(
    () =>
      (authorization?.memberships ?? []).filter(
        (item) => item.role === "physician" && item.professional?.id,
      ),
    [authorization],
  );

  const load = useCallback(async () => {
    if (!supabase || !authorization) {
      setLoading(false);
      return;
    }
    if (!hasStaffRole(authorization, "physician")) {
      setError("O prontuário médico está disponível apenas para médicas autorizadas.");
      setLoading(false);
      return;
    }
    const membership = practiceId
      ? physicianMemberships.find((item) => item.practiceId === practiceId)
      : physicianMemberships[0];
    if (!membership?.professional?.id) {
      setError("Nenhuma prática médica vinculada ao seu perfil.");
      setLoading(false);
      return;
    }
    if (!practiceId) setPracticeId(membership.practiceId);

    setLoading(true);
    setError(null);
    try {
      const [open, recent, patientRows] = await Promise.all([
        listOpenEncountersForProfessional(
          supabase,
          membership.practiceId,
          membership.professional.id,
        ),
        listRecentEncountersForProfessional(
          supabase,
          membership.practiceId,
          membership.professional.id,
        ),
        listPatients(supabase).catch(() => []),
      ]);
      setOpenRows(open);
      setRecentRows(recent);
      setPatients(patientRows);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Não foi possível carregar o prontuário.",
      );
    } finally {
      setLoading(false);
    }
  }, [authorization, practiceId, physicianMemberships, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const nameByPatient = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of patients) map.set(item.id, item.fullName);
    return map;
  }, [patients]);

  if (authorizationLoading || loading) {
    return <p className="text-sm text-lotus-600">Carregando prontuário…</p>;
  }

  return (
    <div className="overflow-x-hidden">
      <header className="card">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">
          Workspace médico
        </p>
        <h1 className="page-title mt-1">Prontuário</h1>
        <p className="mt-2 max-w-2xl text-sm text-lotus-700">
          Pesquisar uma paciente abre o prontuário centrado nela — sem depender da agenda. Atendimentos
          abertos e recentes continuam disponíveis abaixo.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/app/agenda" className={buttonClass}>
            Ir para a agenda
          </Link>
          <Link href="/app/patients" className={ghostButtonClass}>
            Cadastro de pacientes
          </Link>
          <button type="button" className={ghostButtonClass} onClick={() => void load()}>
            Atualizar
          </button>
        </div>
        {physicianMemberships.length > 1 ? (
          <label className="mt-4 block text-sm text-lotus-800">
            Prática
            <select
              className="mt-1 w-full max-w-md rounded-xl border border-lotus-200 bg-white px-3 py-2"
              value={practiceId || physicianMemberships[0]?.practiceId || ""}
              onChange={(event) => setPracticeId(event.target.value)}
            >
              {physicianMemberships.map((item) => (
                <option key={item.practiceId} value={item.practiceId}>
                  {item.practice?.name ?? item.practiceId}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </header>

      <div className="mt-4">
        <StatusMessage error={error} />
      </div>

      {supabase ? (
        <div className="mt-4">
          <PatientSearchPanel supabase={supabase} autoFocus />
        </div>
      ) : null}

      <section className="card mt-4">
        <h2 className="text-base font-semibold text-lotus-900">Atendimentos em aberto</h2>
        <p className="mt-1 text-sm text-lotus-600">
          Encounters com status aberto nesta prática. Encounters assinados não são reabertos por
          aqui.
        </p>
        {openRows.length === 0 ? (
          <p className="mt-3 text-sm text-lotus-600">
            Nenhum atendimento aberto. Use a agenda para iniciar ou continue pelo histórico da
            paciente.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {openRows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-lotus-100 bg-white px-3 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-lotus-950">
                    {nameByPatient.get(row.patientId) ?? "Paciente"}
                  </p>
                  <p className="text-xs text-lotus-600">
                    {formatDateTime(row.createdAt)} · {ENCOUNTER_STATUS_LABEL[row.status]}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={patientChartHref(row.patientId)} className={ghostButtonClass}>
                    Prontuário
                  </Link>
                  <Link href={`/app/records/${row.id}`} className={buttonClass}>
                    Continuar atendimento
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card mt-4">
        <h2 className="text-base font-semibold text-lotus-900">Atendimentos recentes</h2>
        <p className="mt-1 text-sm text-lotus-600">
          Consulta em modo leitura. Atendimentos assinados não podem ser reabertos nem alterados.
        </p>
        {recentRows.length === 0 ? (
          <p className="mt-3 text-sm text-lotus-600">Nenhum atendimento assinado recente.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {recentRows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-lotus-100 bg-white px-3 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-lotus-950">
                    {nameByPatient.get(row.patientId) ?? "Paciente"}
                  </p>
                  <p className="text-xs text-lotus-600">
                    {formatDateTime(row.signedAt ?? row.createdAt)} ·{" "}
                    {ENCOUNTER_STATUS_LABEL[row.status]}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={patientChartHref(row.patientId)} className={ghostButtonClass}>
                    Prontuário
                  </Link>
                  <Link href={`/app/records/${row.id}`} className={ghostButtonClass}>
                    Consultar
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
