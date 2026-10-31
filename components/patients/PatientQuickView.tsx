"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { hasStaffRole } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/client";
import { formatIsoDateBr } from "@/lib/patients/format";
import {
  loadPatient360Snapshot,
  type Patient360Snapshot,
} from "@/lib/patients/patient-360";
import { buttonVariantClass } from "@/components/ui/buttonStyles";
import { friendlyError } from "@/lib/ui/friendly-error";

/**
 * C070-C4.4 — visão rápida reutilizável da paciente.
 * Clínica (SOAP etc.) só para physician; secretaria vê dados operacionais.
 */
export function PatientQuickView({
  patientId,
  open,
  onClose,
  practiceId: practiceIdProp,
}: {
  patientId: string | null;
  open: boolean;
  onClose: () => void;
  practiceId?: string | null;
}) {
  const titleId = useId();
  const { authorization } = useAuth();
  const includeClinical = Boolean(authorization && hasStaffRole(authorization, "physician"));
  const practiceId =
    practiceIdProp ||
    authorization?.memberships.find((m) => m.practiceId)?.practiceId ||
    null;

  const [snapshot, setSnapshot] = useState<Patient360Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !patientId) {
      setSnapshot(null);
      setError(null);
      return;
    }
    const supabase = createClient();
    if (!supabase) {
      setError("Autenticação não configurada neste ambiente.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadPatient360Snapshot(supabase, {
      patientId,
      practiceId,
      includeClinical,
    })
      .then((data) => {
        if (cancelled) return;
        setSnapshot(data);
        if (!data) setError("Paciente não encontrada ou sem permissão.");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSnapshot(null);
        setError(friendlyError(err, "Não foi possível carregar a paciente."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [includeClinical, open, patientId, practiceId]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  if (!open || !patientId) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-lotus-900/40 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      data-patient-quick-view="true"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[min(40rem,calc(100dvh-2rem))] w-full max-w-md overflow-y-auto rounded-2xl border border-lotus-100 bg-white p-4 shadow-lg sm:p-5"
      >
        {loading ? <p className="text-sm text-lotus-600">Carregando paciente…</p> : null}
        {error ? (
          <p className="text-sm text-rose-800" role="alert">
            {error}
          </p>
        ) : null}

        {snapshot && !loading ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">
              Paciente
            </p>
            <h2 id={titleId} className="mt-1 text-xl font-semibold text-lotus-950">
              {snapshot.fullName}
            </h2>
            {snapshot.socialName ? (
              <p className="text-sm text-lotus-600">{snapshot.socialName}</p>
            ) : null}
            <p className="mt-2 text-sm text-lotus-700">
              {[
                snapshot.birthDate
                  ? `Nascimento ${formatIsoDateBr(snapshot.birthDate)}`
                  : null,
                snapshot.ageYears != null ? `${snapshot.ageYears} anos` : null,
                `CPF ${snapshot.cpfMasked}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {snapshot.phoneFormatted ? (
              <p className="mt-1 text-sm text-lotus-700">Telefone {snapshot.phoneFormatted}</p>
            ) : null}

            <dl className="mt-4 space-y-3 text-sm">
              {snapshot.includeClinical ? (
                <div className="rounded-xl bg-lotus-50/80 px-3 py-2.5">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-lotus-500">
                    Último atendimento
                  </dt>
                  <dd className="mt-1 text-lotus-950">
                    {snapshot.lastEncounter
                      ? `${snapshot.lastEncounter.isReturn ? "Retorno" : "Atendimento"} · ${snapshot.lastEncounter.whenLabel} · ${snapshot.lastEncounter.statusLabel}`
                      : "Ainda não há atendimentos registrados."}
                  </dd>
                </div>
              ) : null}

              <div className="rounded-xl bg-lotus-50/80 px-3 py-2.5">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-lotus-500">
                  Próxima consulta
                </dt>
                <dd className="mt-1 text-lotus-950">
                  {snapshot.nextAppointment
                    ? [
                        snapshot.nextAppointment.whenLabel,
                        snapshot.nextAppointment.kindLabel,
                        snapshot.nextAppointment.professionalName,
                        snapshot.nextAppointment.statusLabel,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : "Nenhuma consulta futura nos próximos 60 dias."}
                </dd>
              </div>

              {snapshot.includeClinical ? (
                <div className="rounded-xl bg-lotus-50/80 px-3 py-2.5">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-lotus-500">
                    Obstetrícia
                  </dt>
                  <dd className="mt-1 text-lotus-950">
                    {snapshot.pregnancy
                      ? [
                          snapshot.pregnancy.statusLabel,
                          snapshot.pregnancy.lmpLabel
                            ? `DUM ${snapshot.pregnancy.lmpLabel}`
                            : null,
                          snapshot.pregnancy.eddLabel
                            ? `DPP ${snapshot.pregnancy.eddLabel}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : "Nenhuma gestação ativa cadastrada."}
                  </dd>
                </div>
              ) : null}

              {snapshot.includeClinical ? (
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-lotus-50/80 px-3 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-lotus-500">
                      Exames
                    </p>
                    <p className="mt-1 font-medium text-lotus-950">
                      {snapshot.examsCount} registro(s)
                    </p>
                  </div>
                  <div className="rounded-xl bg-lotus-50/80 px-3 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-lotus-500">
                      Receitas
                    </p>
                    <p className="mt-1 font-medium text-lotus-950">
                      {snapshot.prescriptionsCount} registro(s)
                    </p>
                  </div>
                </div>
              ) : null}
            </dl>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <button type="button" className={buttonVariantClass.ghost} onClick={onClose}>
                Fechar
              </button>
              <Link
                href={snapshot.links.agenda}
                className={buttonVariantClass.secondary}
                onClick={onClose}
              >
                Agendar
              </Link>
              {snapshot.links.chart ? (
                <Link
                  href={snapshot.links.chart}
                  className={buttonVariantClass.primary}
                  onClick={onClose}
                >
                  Abrir prontuário
                </Link>
              ) : (
                <Link
                  href={snapshot.links.detail}
                  className={buttonVariantClass.primary}
                  onClick={onClose}
                >
                  Abrir paciente
                </Link>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
