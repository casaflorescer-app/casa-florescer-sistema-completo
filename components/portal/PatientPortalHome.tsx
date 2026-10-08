"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { StatusMessage, buttonClass, ghostButtonClass } from "@/components/platform/Ui";
import {
  JOURNEY_STATUS_LABEL,
  NOTIFICATION_CATEGORY_LABEL,
  classifyNotificationEvent,
  formatClock,
  formatDateTimeShort,
  formatDay,
  listPatientPortalAppointments,
  patientPortalRecordArrival,
  pickNextAppointment,
  predictionCopy,
} from "@/lib/portal/directory";
import type { PatientNotificationCategory, PatientPortalAppointment } from "@/lib/portal/types";
import { PatientOrientationsPortal } from "@/components/orientations/PatientOrientationsPortal";
import {
  dismissPatientNotification,
  listPatientNotifications,
  markPatientNotificationRead,
} from "@/lib/orientations/directory";
import type { PatientNotificationRow } from "@/lib/orientations/types";

const PORTAL_EVENTS = [
  "appointment_schedule_updated",
  "appointment_attendance_started",
  "appointment_attendance_ended",
  "clinical_orientation_published",
  "prescription_published",
] as const;

function journeyTone(status: string): string {
  if (status === "cancelled" || status === "no_show") return "border-rose-200 bg-rose-50 text-rose-800";
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "in_progress" || status === "delayed") {
    return "border-amber-200 bg-amber-50 text-amber-950";
  }
  if (status === "waiting") return "border-sky-200 bg-sky-50 text-sky-950";
  return "border-lotus-200 bg-lotus-50 text-lotus-900";
}

function AppointmentJourneyCard({
  row,
  highlight,
  onArrive,
  arriving,
}: {
  row: PatientPortalAppointment;
  highlight?: boolean;
  onArrive?: () => void;
  arriving?: boolean;
}) {
  const copy = predictionCopy(row);
  const predictedClock = row.predictedStartsAt
    ? formatClock(row.predictedStartsAt)
    : formatClock(row.scheduledStartsAt);
  const delay = row.delayMinutes ?? 0;
  const showDelayBadge = delay >= 5 && !row.isEarlier && row.journeyStatus !== "completed";

  return (
    <article
      className={`rounded-2xl border bg-white p-4 shadow-sm ${
        highlight ? "border-[#E8B4B8] ring-1 ring-[#F0D5C8]" : "border-lotus-100"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">
            {formatDay(row.scheduledStartsAt)}
          </p>
          <h3 className="mt-1 text-lg font-semibold text-lotus-950">{row.procedureLabel}</h3>
          <p className="mt-0.5 text-sm text-lotus-700">{row.professionalName}</p>
          {row.roomName ? <p className="mt-1 text-sm text-lotus-600">Sala: {row.roomName}</p> : null}
        </div>
        <span
          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${journeyTone(row.journeyStatus)}`}
        >
          {JOURNEY_STATUS_LABEL[row.journeyStatus]}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-lotus-50/80 px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">Horário agendado</p>
          <p className="mt-1 text-2xl font-semibold text-lotus-950">{formatClock(row.scheduledStartsAt)}</p>
        </div>
        <div className="rounded-xl bg-[#FFF8F5] px-3 py-3 ring-1 ring-[#F0D5C8]">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#9A5B64]">Previsão atual</p>
          <p className="mt-1 text-2xl font-semibold text-[#5C2E35]">{predictedClock}</p>
          {showDelayBadge ? (
            <p className="mt-1 text-sm font-medium text-[#9A5B64]">Atraso estimado: +{delay} min</p>
          ) : null}
        </div>
      </div>

      {row.actualStartAt || row.actualEndAt ? (
        <dl className="mt-3 grid gap-2 text-sm text-lotus-700 sm:grid-cols-2">
          {row.actualStartAt ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-lotus-500">Início efetivo</dt>
              <dd className="mt-0.5 font-medium text-lotus-900">{formatClock(row.actualStartAt)}</dd>
            </div>
          ) : null}
          {row.actualEndAt ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-lotus-500">Término efetivo</dt>
              <dd className="mt-0.5 font-medium text-lotus-900">{formatClock(row.actualEndAt)}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {row.predictionUpdatedAt ? (
        <p className="mt-3 text-xs text-lotus-500">
          Última atualização da previsão: {formatDateTimeShort(row.predictionUpdatedAt)}
        </p>
      ) : null}

      <p className="mt-3 text-sm font-medium text-lotus-900">{copy.headline}</p>
      <p className="mt-1 text-sm text-lotus-700">{copy.detail}</p>
      {copy.reassurance ? (
        <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{copy.reassurance}</p>
      ) : null}

      {onArrive &&
      !row.hasArrived &&
      !row.actualEndAt &&
      !["cancelled", "no_show", "completed"].includes(row.status) ? (
        <div className="mt-4">
          <button type="button" className={buttonClass} disabled={arriving} onClick={onArrive}>
            {arriving ? "Registrando…" : "Cheguei à clínica"}
          </button>
          <p className="mt-1 text-xs text-lotus-500">
            Use somente quando estiver na Casa Florescer. Isso registra sua chegada física.
          </p>
        </div>
      ) : null}

      {row.hasArrived && !row.actualStartAt ? (
        <p className="mt-3 text-sm font-medium text-sky-900">Chegada registrada. Aguarde o atendimento.</p>
      ) : null}
    </article>
  );
}

export function PatientPortalHome() {
  const { authorization, authorizationLoading } = useAuth();
  const supabase = createClient();
  const [appointments, setAppointments] = useState<PatientPortalAppointment[]>([]);
  const [notifications, setNotifications] = useState<PatientNotificationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<"home" | "communications" | "documents">("home");
  const [commFilter, setCommFilter] = useState<"all" | PatientNotificationCategory>("all");
  const [arrivingId, setArrivingId] = useState<string | null>(null);

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
      listPatientNotifications(supabase, 40),
    ]);
    if (portal.error) setError(portal.error);
    setAppointments(portal.data?.appointments ?? []);
    setNotifications(notifs.filter((item) => PORTAL_EVENTS.includes(item.eventType as (typeof PORTAL_EVENTS)[number])));
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

  const openNotifications = useMemo(
    () =>
      notifications
        .filter((item) => !item.dismissedAt)
        .filter((item) => (commFilter === "all" ? true : classifyNotificationEvent(item.eventType) === commFilter)),
    [notifications, commFilter],
  );

  const unreadHome = notifications.filter((item) => !item.dismissedAt && !item.readAt).slice(0, 5);

  async function dismiss(id: string) {
    if (!supabase) return;
    await dismissPatientNotification(supabase, id);
    setNotifications((prev) =>
      prev.map((item) => (item.id === id ? { ...item, dismissedAt: new Date().toISOString() } : item)),
    );
  }

  async function markRead(id: string) {
    if (!supabase) return;
    await markPatientNotificationRead(supabase, id);
    setNotifications((prev) =>
      prev.map((item) => (item.id === id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item)),
    );
  }

  async function onArrive(appointmentId: string) {
    if (!supabase) return;
    setArrivingId(appointmentId);
    setError(null);
    setNotice(null);
    const result = await patientPortalRecordArrival(supabase, appointmentId);
    setArrivingId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setNotice("Chegada registrada. Obrigada!");
    await reload();
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
          Acompanhe sua consulta, a previsão atualizada do horário e as comunicações da Casa Florescer — sem precisar
          ligar.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            className={section === "home" ? buttonClass : ghostButtonClass}
            onClick={() => setSection("home")}
          >
            Jornada
          </button>
          <button
            type="button"
            className={section === "communications" ? buttonClass : ghostButtonClass}
            onClick={() => setSection("communications")}
          >
            Comunicações
            {unreadHome.length > 0 ? (
              <span className="ml-2 inline-flex min-w-5 justify-center rounded-full bg-[#B76E79] px-1.5 text-xs text-white">
                {unreadHome.length}
              </span>
            ) : null}
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

      <StatusMessage error={error} notice={notice} />

      {section === "home" ? (
        <>
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-lotus-900">Próximo atendimento</h2>
            {next ? (
              <AppointmentJourneyCard
                row={next}
                highlight
                arriving={arrivingId === next.appointmentId}
                onArrive={() => void onArrive(next.appointmentId)}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-lotus-200 bg-white px-4 py-6 text-sm text-lotus-700">
                Você não tem consultas futuras no momento.
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-lotus-900">Comunicações recentes</h2>
              <button type="button" className={ghostButtonClass} onClick={() => setSection("communications")}>
                Ver todas
              </button>
            </div>
            {unreadHome.length === 0 ? (
              <p className="text-sm text-lotus-600">Nenhuma comunicação nova.</p>
            ) : (
              <ul className="space-y-2">
                {unreadHome.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-xl border border-lotus-100 bg-white px-3 py-3"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">
                      {NOTIFICATION_CATEGORY_LABEL[classifyNotificationEvent(item.eventType)]}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-lotus-900">{item.title}</p>
                    <p className="mt-1 text-sm text-lotus-700">{item.message}</p>
                    <p className="mt-1 text-xs text-lotus-500">{formatDateTimeShort(item.createdAt)}</p>
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
                  <AppointmentJourneyCard key={row.appointmentId} row={row} />
                ))}
              </div>
            )}
          </section>

          <p className="text-sm text-lotus-600">
            Para alterar ou cancelar um horário, fale com a equipe da Casa Florescer. Este aplicativo acompanha a
            previsão, mas não altera a agenda administrativa.
          </p>
        </>
      ) : null}

      {section === "communications" ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-lotus-900">Central de comunicações</h2>
          <p className="text-sm text-lotus-600">
            Histórico das mensagens da Casa Florescer. Conteúdo clínico detalhado permanece em Documentos.
          </p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", "Todas"],
                ["operational", "Operacional"],
                ["clinical", "Clínico"],
                ["relationship", "Relacionamento"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={commFilter === key ? buttonClass : ghostButtonClass}
                onClick={() => setCommFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {openNotifications.length === 0 ? (
            <p className="text-sm text-lotus-600">Nenhuma comunicação nesta categoria.</p>
          ) : (
            <ul className="space-y-2">
              {openNotifications.map((item) => {
                const category = classifyNotificationEvent(item.eventType);
                return (
                  <li
                    key={item.id}
                    className={`rounded-xl border px-3 py-3 ${
                      item.readAt ? "border-lotus-100 bg-white" : "border-[#E8B4B8] bg-[#FFF8F5]"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">
                          {NOTIFICATION_CATEGORY_LABEL[category]}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-lotus-900">{item.title}</p>
                        <p className="mt-1 text-sm text-lotus-700">{item.message}</p>
                        <p className="mt-1 text-xs text-lotus-500">{formatDateTimeShort(item.createdAt)}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {!item.readAt ? (
                          <button type="button" className={ghostButtonClass} onClick={() => void markRead(item.id)}>
                            Marcar como lida
                          </button>
                        ) : null}
                        <button type="button" className={ghostButtonClass} onClick={() => void dismiss(item.id)}>
                          Dispensar
                        </button>
                        {category === "clinical" ? (
                          <button type="button" className={ghostButtonClass} onClick={() => setSection("documents")}>
                            Abrir documentos
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-lotus-500">
            WhatsApp, e-mail e push web reais ainda não estão ativos. As comunicações deste portal são in-app.
          </p>
        </section>
      ) : null}

      {section === "documents" ? <PatientOrientationsPortal embedded /> : null}
    </div>
  );
}
