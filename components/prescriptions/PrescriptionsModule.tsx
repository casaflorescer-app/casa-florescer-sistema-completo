"use client";

/**
 * C042 — Módulo MÉDICO → Receitas (operacional).
 * Fluxo: pesquisar paciente → histórico → nova receita (ClinicalPrescriptionPanel).
 * Sem prontuário paralelo; PatientChart permanece a rota oficial.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { hasStaffRole } from "@/lib/auth/access";
import {
  getPatient,
  maskCpf,
  patientChartHref,
  type PatientDetailRow,
  type PatientListRow,
} from "@/lib/patients/directory";
import { formatIsoDateBr, formatPhone } from "@/lib/patients/format";
import { PatientSearchPanel } from "@/components/attendance/PatientSearchPanel";
import { ClinicalPrescriptionPanel } from "@/components/prescriptions/ClinicalPrescriptionPanel";
import { StatusMessage, buttonClass, ghostButtonClass } from "@/components/platform/Ui";

export function PrescriptionsModule() {
  const { authorization, authorizationLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const initialPatientId = searchParams.get("patientId")?.trim() || "";

  const [practiceId, setPracticeId] = useState("");
  const [patientId, setPatientId] = useState(initialPatientId);
  const [patient, setPatient] = useState<PatientDetailRow | null>(null);
  const [loadingPatient, setLoadingPatient] = useState(Boolean(initialPatientId));
  const [error, setError] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(!initialPatientId);

  const physicianMemberships = useMemo(
    () =>
      (authorization?.memberships ?? []).filter(
        (item) => item.role === "physician" && item.professional?.id,
      ),
    [authorization],
  );

  const membership = useMemo(() => {
    if (!physicianMemberships.length) return null;
    return (
      physicianMemberships.find((item) => item.practiceId === practiceId) ??
      physicianMemberships[0]
    );
  }, [physicianMemberships, practiceId]);

  const canManage = Boolean(authorization && hasStaffRole(authorization, "physician"));
  const canView = Boolean(
    authorization &&
      (canManage ||
        hasStaffRole(authorization, "secretary") ||
        hasStaffRole(authorization, "owner") ||
        hasStaffRole(authorization, "admin")),
  );

  const loadPatient = useCallback(
    async (id: string) => {
      if (!supabase || !id) {
        setPatient(null);
        setLoadingPatient(false);
        return;
      }
      setLoadingPatient(true);
      setError(null);
      try {
        const detail = await getPatient(supabase, id);
        if (!detail) {
          setPatient(null);
          setError("Paciente não encontrada ou sem permissão no seu escopo.");
          return;
        }
        setPatient(detail);
        setPatientId(detail.id);
        setShowSearch(false);
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          url.searchParams.set("patientId", detail.id);
          window.history.replaceState({}, "", url.toString());
        }
      } catch (caught) {
        setPatient(null);
        setError(
          caught instanceof Error ? caught.message : "Não foi possível carregar a paciente.",
        );
      } finally {
        setLoadingPatient(false);
      }
    },
    [supabase],
  );

  useEffect(() => {
    if (membership?.practiceId && !practiceId) setPracticeId(membership.practiceId);
  }, [membership, practiceId]);

  useEffect(() => {
    if (initialPatientId && canView) void loadPatient(initialPatientId);
  }, [canView, initialPatientId, loadPatient]);

  function onSelectPatient(row: PatientListRow) {
    void loadPatient(row.id);
  }

  function clearPatient() {
    setPatient(null);
    setPatientId("");
    setShowSearch(true);
    setError(null);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("patientId");
      window.history.replaceState({}, "", url.toString());
    }
  }

  if (authorizationLoading) {
    return <p className="text-sm text-lotus-600">Carregando receitas…</p>;
  }

  if (!supabase) {
    return <p className="text-sm text-lotus-600">Supabase não configurado.</p>;
  }

  if (!canView) {
    return (
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">Médico</p>
        <h1 className="page-title mt-1">Receitas</h1>
        <p className="mt-3 text-sm text-rose-800">
          Sem permissão para acessar o módulo de receitas.
        </p>
      </div>
    );
  }

  if (!membership?.professional?.id && canManage) {
    return (
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">Médico</p>
        <h1 className="page-title mt-1">Receitas</h1>
        <p className="mt-3 text-sm text-lotus-700">
          Nenhuma prática médica vinculada ao seu perfil.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-hidden">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">Médico</p>
        <h1 className="page-title mt-1">Receitas</h1>
        <p className="page-sub mt-2">
          Pesquise a paciente, consulte o histórico e emita receitas. A emissão permanece com a
          médica; a secretaria visualiza documentos já assinados conforme a regra existente.
        </p>
      </header>

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

      <div className="mt-4">
        <StatusMessage error={error} />
      </div>

      {!patient || showSearch ? (
        <div className="mt-4">
          <PatientSearchPanel
            supabase={supabase}
            title="Pesquisar paciente"
            hint="Selecione a paciente para consultar ou criar receitas. Homônimos: use nascimento e CPF."
            actionLabel="Selecionar paciente"
            autoFocus
            onSelectPatient={onSelectPatient}
          />
          {!patient ? (
            <p className="mt-3 text-sm text-lotus-600">Pesquise e selecione um paciente.</p>
          ) : null}
        </div>
      ) : null}

      {loadingPatient ? (
        <p className="mt-4 text-sm text-lotus-600">Carregando paciente…</p>
      ) : null}

      {patient && membership ? (
        <section className="card mt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-lotus-500">
                Paciente
              </p>
              <h2 className="mt-1 text-lg font-semibold text-lotus-950">{patient.fullName}</h2>
              {patient.socialName ? (
                <p className="text-sm text-lotus-600">{patient.socialName}</p>
              ) : null}
              <p className="mt-1 text-xs text-lotus-600">
                Nascimento: {patient.birthDate ? formatIsoDateBr(patient.birthDate) : "—"}
                {" · "}
                CPF: {maskCpf(patient.cpf)}
                {patient.phone ? ` · ${formatPhone(patient.phone)}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={patientChartHref(patient.id)} className={buttonClass}>
                Abrir prontuário
              </Link>
              <button type="button" className={ghostButtonClass} onClick={clearPatient}>
                Trocar paciente
              </button>
              <button
                type="button"
                className={ghostButtonClass}
                onClick={() => setShowSearch((v) => !v)}
              >
                {showSearch ? "Ocultar pesquisa" : "Pesquisar outra"}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {patient && membership?.professional?.id ? (
        <ClinicalPrescriptionPanel
          supabase={supabase}
          organizationId={
            patient.organizationId ||
            membership.practice?.organizationId ||
            authorization?.profile?.organizationId ||
            ""
          }
          practiceId={membership.practiceId}
          patientId={patient.id}
          professionalId={membership.professional.id}
          canManage={canManage}
        />
      ) : null}

      {patient && !canManage ? (
        <p className="mt-4 text-sm text-lotus-600">
          Modo visualização: emissão de receita é exclusiva da médica.
        </p>
      ) : null}
    </div>
  );
}
