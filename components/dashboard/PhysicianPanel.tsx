"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { AuthorizationContext } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/client";
import {
  listAppointments,
  listOpenEncountersForProfessional,
} from "@/lib/attendance/directory";
import {
  APPOINTMENT_STATUS_LABEL,
  type AppointmentRow,
  type EncounterRow,
} from "@/lib/attendance/types";
import {
  ASSISTENTIAL_BUCKET_LABEL,
  classifyAppointmentAssistential,
  type AssistentialBucket,
} from "@/lib/attendance/assistential-classify";
import { dayBoundsIso, todayInputDate } from "@/components/attendance/agenda-display";
import {
  listPatients,
  patientChartHref,
  type PatientListRow,
} from "@/lib/patients/directory";
import { buttonClass, ghostButtonClass } from "@/components/platform/Ui";
import { RowActions } from "@/components/ui/RowActions";

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function PhysicianPanel({ auth }: { auth: AuthorizationContext }) {
  const membership = useMemo(
    () =>
      auth.memberships.find((item) => item.role === "physician" && item.professional?.id) ??
      auth.memberships.find((item) => item.professional?.id) ??
      null,
    [auth.memberships],
  );
  const practiceId = membership?.practiceId ?? null;
  const professionalId = membership?.professional?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [patientsById, setPatientsById] = useState<Map<string, PatientListRow>>(new Map());
  const [roomNames, setRoomNames] = useState<Map<string, string>>(new Map());
  const [openEncounters, setOpenEncounters] = useState<EncounterRow[]>([]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !practiceId || !professionalId) {
      setLoading(false);
      setError(
        !practiceId || !professionalId
          ? "Vínculo profissional não encontrado para montar o painel do dia."
          : "Autenticação não configurada.",
      );
      return;
    }
    const today = todayInputDate();
    const bounds = dayBoundsIso(today);
    if (!bounds) {
      setLoading(false);
      setError("Data inválida.");
      return;
    }

    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [apptRows, patientRows, openRows, roomsRes] = await Promise.all([
          listAppointments(supabase, {
            practiceId,
            from: bounds.from,
            to: bounds.to,
            professionalId,
          }),
          listPatients(supabase),
          listOpenEncountersForProfessional(supabase, practiceId, professionalId, 20),
          supabase.from("rooms").select("id, name").eq("organization_id", auth.organization?.id ?? ""),
        ]);
        if (cancelled) return;
        const pMap = new Map<string, PatientListRow>();
        for (const p of patientRows) pMap.set(p.id, p);
        const rMap = new Map<string, string>();
        for (const raw of roomsRes.data ?? []) {
          const row = raw as { id?: string; name?: string };
          if (row.id && row.name) rMap.set(row.id, row.name);
        }
        setAppointments(apptRows);
        setPatientsById(pMap);
        setRoomNames(rMap);
        setOpenEncounters(openRows);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Não foi possível carregar o painel.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [auth.organization?.id, practiceId, professionalId]);

  const activeAppts = useMemo(
    () =>
      appointments.filter(
        (row) => row.status !== "cancelled" && row.status !== "no_show",
      ),
    [appointments],
  );

  const counts = useMemo(() => {
    const base: Record<AssistentialBucket, number> = {
      gynecology: 0,
      obstetrics: 0,
      procedure: 0,
    };
    for (const row of activeAppts) {
      const specialties = patientsById.get(row.patientId)?.careSpecialties ?? [];
      const bucket = classifyAppointmentAssistential(row.kind, specialties);
      base[bucket] += 1;
    }
    return base;
  }, [activeAppts, patientsById]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return activeAppts
      .filter(
        (row) =>
          row.status !== "completed" &&
          new Date(row.startsAt).getTime() >= now - 30 * 60 * 1000,
      )
      .slice(0, 6);
  }, [activeAppts]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">Painel</p>
        <h1 className="page-title mt-1">Visão geral</h1>
        <p className="page-sub mt-2">O que tenho hoje na prática.</p>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-100 bg-white px-4 py-3 text-sm text-rose-800" role="alert">
          {error}
        </p>
      ) : null}

      <section className="card" aria-labelledby="atendimentos-hoje">
        <h2 id="atendimentos-hoje" className="text-base font-semibold text-lotus-900">
          Atendimentos de hoje
        </h2>
        {loading ? (
          <p className="mt-3 text-sm text-lotus-600">Carregando…</p>
        ) : (
          <>
            <p className="mt-3 text-3xl font-semibold text-lotus-950">{activeAppts.length}</p>
            <p className="text-sm text-lotus-600">Total no dia (excluindo cancelados / não compareceu)</p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              {(Object.keys(ASSISTENTIAL_BUCKET_LABEL) as AssistentialBucket[]).map((key) => (
                <div key={key} className="rounded-xl border border-lotus-100 bg-lotus-50/60 px-3 py-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-lotus-500">
                    {ASSISTENTIAL_BUCKET_LABEL[key]}
                  </dt>
                  <dd className="mt-1 text-xl font-semibold text-lotus-900">{counts[key]}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </section>

      <section className="card" aria-labelledby="proximos">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="proximos" className="text-base font-semibold text-lotus-900">
            Próximos atendimentos
          </h2>
          <Link href="/app/agenda" className="text-sm font-medium text-lotus-800 underline-offset-2 hover:underline">
            Abrir agenda
          </Link>
        </div>
        {loading ? (
          <p className="mt-3 text-sm text-lotus-600">Carregando…</p>
        ) : upcoming.length === 0 ? (
          <p className="mt-3 text-sm text-lotus-600">Nenhum próximo atendimento hoje.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {upcoming.map((row) => {
              const patient = patientsById.get(row.patientId);
              const bucket = classifyAppointmentAssistential(
                row.kind,
                patient?.careSpecialties ?? [],
              );
              return (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-lotus-100 bg-white px-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-lotus-950">
                      {formatTime(row.startsAt)} · {patient?.fullName ?? "Paciente"}
                    </p>
                    <p className="text-xs text-lotus-600">
                      {ASSISTENTIAL_BUCKET_LABEL[bucket]}
                      {roomNames.get(row.roomId) ? ` · ${roomNames.get(row.roomId)}` : ""}
                      {` · ${APPOINTMENT_STATUS_LABEL[row.status]}`}
                    </p>
                  </div>
                  <RowActions
                    primary={{
                      id: "agenda",
                      label: "Abrir na agenda",
                      href: "/app/agenda",
                    }}
                    secondary={[
                      {
                        id: "chart",
                        label: "Abrir prontuário",
                        href: patientChartHref(row.patientId),
                      },
                    ]}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="em-andamento">
        <h2 id="em-andamento" className="text-base font-semibold text-lotus-900">
          Atendimentos em andamento
        </h2>
        {loading ? (
          <p className="mt-3 text-sm text-lotus-600">Carregando…</p>
        ) : openEncounters.length === 0 ? (
          <p className="mt-3 text-sm text-lotus-600">Nenhum encounter aberto no momento.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {openEncounters.map((enc) => {
              const patient = patientsById.get(enc.patientId);
              return (
                <li
                  key={enc.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-lotus-100 bg-white px-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-lotus-950">
                      {patient?.fullName ?? "Paciente"}
                    </p>
                    <p className="text-xs text-lotus-600">Encounter em aberto · Workspace oficial</p>
                  </div>
                  <Link href={`/app/records/${enc.id}`} className={buttonClass}>
                    Continuar atendimento
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link href="/app/patients" className="card block transition-colors hover:border-lotus-200">
          <h3 className="font-semibold text-lotus-900">Pacientes</h3>
          <p className="mt-1 text-sm text-lotus-700">Pesquisar, filtrar e abrir prontuário.</p>
        </Link>
        <Link href="/app/records" className="card block transition-colors hover:border-lotus-200">
          <h3 className="font-semibold text-lotus-900">Prontuário</h3>
          <p className="mt-1 text-sm text-lotus-700">Índice e busca centrada na paciente (C040.10).</p>
        </Link>
      </section>
    </div>
  );
}
