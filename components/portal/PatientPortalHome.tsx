"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { StatusMessage, buttonClass, ghostButtonClass } from "@/components/platform/Ui";
import { APPOINTMENT_STATUS_LABEL } from "@/lib/attendance/types";
import {
  formatClock,
  formatDay,
  listPatientPortalAppointments,
  pickNextAppointment,
  predictionCopy,
} from "@/lib/portal/directory";
import type { PatientPortalAppointment } from "@/lib/portal/types";
import { PatientOrientationsPortal } from "@/components/orientations/PatientOrientationsPortal";
import {
  dismissPatientNotification,
  listPatientNotifications,
} from "@/lib/orientations/directory";
import type { PatientNotificationRow } from "@/lib/orientations/types";

const SCHEDULE_EVENT = "appointment_schedule_updated";

function statusTone(status: string): string {
  if (status === "cancelled" || status === "no_show") return "border-rose-200 bg-rose-50 text-rose-800";
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "in_progress" || status === "checked_in") {
    return "border-amber-200 bg-amber-50 text-amber-950";
  }
  return "border-lotus-200 bg-lotus-50 text-lotus-900";
}

function AppointmentDetailCard({ row }: { row: PatientPortalAppointment }) {
  const copy = predictionCopy(row);
  return (
    <article className="rounded-2xl border border-lotus-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">
            {formatDay(row.scheduledStartsAt)}
          </p>
          <h3 className="mt-1 text-lg font-semibold text-lotus-950">{row.professionalName}</h3>
          <p className="mt-0.5 text-sm text-lotus-700">{row.procedureLabel}</p>
          {row.roomName ? <p className="mt-1 text-sm text-lotus-600">Sala: {row.roomName}</p> : null}
        </div>
        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(row.status)}`}>
          {APPOINTMENT_STATUS_LABEL[row.status] ?? row.status}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-lotus-50/80 px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">Agendado</p>
          <p className="mt-1 text-2xl font-semibold text-lotus-950">{formatClock(row.scheduledStartsAt)}</p>
        </div>
        <div className="rounded-xl bg-[#FFF8F5] px-3 py-3 ring-1 ring-[#F0D5C8]">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#9A5B64]">Previsão atual</p>
          <p className="mt-1 text-2xl font-semibold text-[#5C2E35]">
            {row.predictedStartsAt ? formatClock(row.predictedStartsAt) : formatClock(row.scheduledStartsAt)}
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm font-medium text-lotus-900">{copy.headline}</p>
      <p className="mt-1 text-sm text-lotus-700">{copy.detail}</p>
    </article>
  );
}

export function PatientPortalHome() {
  const { authorization, authorizationLoading } = useAuth();
  const supabase = createClient();
  const [appointments, setAppointments] = useState<PatientPortalAppointment[]>([]);
  const [notifications, setNotifications] = useState<PatientNotificationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<"home" | "documents">("home");

  const patientName =
    authorization?.profile?.fullName?.split(" ")[0] ||
    authorization?.patientAccount?.patientId?.slice(0, 6) ||
    "bem-vinda";

  const reload = useCallback(async () => {
    if (!supabase || !authorization?.patientAccount?.patientId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const [portal, notifs] = await Promise.all([
      listPatientPortalAppointments(supabase),
      listPatientNotifications(supabase),
    ]);
    if (portal.error) setError(portal.error);
    setAppointments(portal.data?.appointments ?? []);
    setNotifications(
      notifs.filter((item) =>
        [
          SCHEDULE_EVENT,
          "clinical_orientation_published",
          "prescription_published",
        ].includes(item.eventType),
      ),
    );
    setLoading(false);
  }, [authorization?.patientAccount?.patientId, supabase]);

  useEffect(() => {
    if (authorizationLoading) return;
    void reload();
  }, [authorizationLoading, reload]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") void reload();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  const next = useMemo(() => pickNextAppointment(appointments), [appointments]);
  const others = useMemo(
    () => appointments.filter((row) => row.appointmentId !== next?.appointmentId).slice(0, 8),
    [appointments, next],
  );
  const openNotifications = notifications.filter((item) => !item.dismissedAt).slice(0, 8);

  async function dismiss(id: string) {
    if (!supabase) return;
    await dismissPatientNotification(supabase, id);
    setNotifications((prev) => prev.map((item) => (item.id === id ? { ...item, dismissedAt: new Date().toISOString() } : item)));
  }

  if (authorizationLoading || loading) {
    return <p className="page-sub">Carregando seu portal…</p>;
  }

  if (!authorization?.patientAccount) {
    return (
      <section className="card">
        <h1 className="page-title">Portal da paciente</h1>
        <p className="page-sub mt-2">Esta área é exclusiva para contas de paciente.</p>
      </section>
    );
  }

  return (
    <div className="space-y-5 overflow-x-hidden">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#B76E79]">Minha Casa Florescer</p>
        <h1 className="page-title">Olá, {patientName}</h1>
        <p className="page-sub max-w-2xl">
          Aqui você acompanha suas consultas, a previsão atualizada do horário e seus documentos clínicos
          publicados.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            className={section === "home" ? buttonClass : ghostButtonClass}
            onClick={() => setSection("home")}
          >
            Consultas
          </button>
          <button
            type="button"
            className={section === "documents" ? buttonClass : ghostButtonClass}
            onClick={() => setSection("documents")}
          >
            Documentos e feedback
          </button>
          <button type="button" className={ghostButtonClass} onClick={() => void reload()}>
            Atualizar
          </button>
        </div>
      </header>

      {error ? <StatusMessage error={error} /> : null}

      {section === "home" ? (
        <>
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-lotus-900">Próximo atendimento</h2>
            {next ? (
              <AppointmentDetailCard row={next} />
            ) : (
              <div className="rounded-2xl border border-dashed border-lotus-200 bg-white px-4 py-6 text-sm text-lotus-700">
                Você não tem consultas futuras no momento.
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-lotus-900">Notificações</h2>
            {openNotifications.length === 0 ? (
              <p className="text-sm text-lotus-600">Nenhuma notificação nova.</p>
            ) : (
              <ul className="space-y-2">
                {openNotifications.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-lotus-100 bg-white px-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-lotus-900">{item.title}</p>
                      <p className="mt-1 text-sm text-lotus-700">{item.message}</p>
                    </div>
                    <button type="button" className={ghostButtonClass} onClick={() => void dismiss(item.id)}>
                      Dispensar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-lotus-900">Outras consultas</h2>
            {others.length === 0 ? (
              <p className="text-sm text-lotus-600">Nenhum outro atendimento listado.</p>
            ) : (
              <div className="grid gap-3">
                {others.map((row) => (
                  <AppointmentDetailCard key={row.appointmentId} row={row} />
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <PatientOrientationsPortal embedded />
      )}
    </div>
  );
}
