"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { hasStaffRole } from "@/lib/auth/access";
import {
  ENCOUNTER_STATUS_LABEL,
  listOpenEncountersForProfessional,
  type EncounterRow,
} from "@/lib/attendance/directory";
import { listPatients, type PatientListRow } from "@/lib/patients/directory";
import { formatDateTime } from "@/lib/platform/format";
import { StatusMessage, buttonClass, ghostButtonClass } from "@/components/platform/Ui";

export function RecordsIndex() {
  const { authorization, authorizationLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<EncounterRow[]>([]);
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
      const [openRows, patientRows] = await Promise.all([
        listOpenEncountersForProfessional(
          supabase,
          membership.practiceId,
          membership.professional.id,
        ),
        listPatients(supabase).catch(() => []),
      ]);
      setRows(openRows);
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
          Experiência oficial do atendimento clínico. Inicie ou continue pela agenda; use esta
          página para retomar encounters abertos.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/app/agenda" className={buttonClass}>
            Ir para a agenda
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

      <section className="card mt-4">
        <h2 className="text-base font-semibold text-lotus-900">Atendimentos em aberto</h2>
        <p className="mt-1 text-sm text-lotus-600">
          Encounters com status aberto nesta prática. Encounters assinados não são reabertos por
          aqui.
        </p>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-lotus-600">
            Nenhum atendimento aberto. Use a agenda para iniciar ou continuar.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {rows.map((row) => (
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
                <Link href={`/app/records/${row.id}`} className={buttonClass}>
                  Continuar atendimento
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
