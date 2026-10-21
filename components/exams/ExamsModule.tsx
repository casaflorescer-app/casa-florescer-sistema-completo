"use client";

/**
 * C042 — Módulo MÉDICO → Exames (operacional).
 * Fluxo: pesquisar paciente → pedidos anteriores → novo pedido (exige encounter aberto).
 * Pedido (clinical_exam_requests) ≠ Resultado/anexo (exam_orders).
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
import {
  ENCOUNTER_STATUS_LABEL,
  listEncountersForPatient,
  type EncounterRow,
} from "@/lib/attendance/directory";
import {
  listExamRequestsForPatient,
  type ExamRequestRow,
} from "@/lib/attendance/clinical-support-directory";
import {
  createSignedDocumentUrl,
  listDocumentsForPatient,
} from "@/lib/documents/directory";
import type { ClinicalDocumentRow } from "@/lib/documents/types";
import { PatientSearchPanel } from "@/components/attendance/PatientSearchPanel";
import { ExamRequestPanel } from "@/components/attendance/ExamRequestPanel";
import { ClinicalExamsPanel } from "@/components/exams/ClinicalExamsPanel";
import { StatusMessage, buttonClass, ghostButtonClass } from "@/components/platform/Ui";
import { formatDateTime } from "@/lib/platform/format";
import { RowActions } from "@/components/ui/RowActions";
import type { OverflowItem } from "@/components/ui/OverflowMenu";

const REQUEST_STATUS_LABEL: Record<ExamRequestRow["status"], string> = {
  draft: "Rascunho",
  confirmed: "Solicitado",
  cancelled: "Cancelado",
};

export function ExamsModule() {
  const { authorization, authorizationLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const initialPatientId = searchParams.get("patientId")?.trim() || "";

  const [practiceId, setPracticeId] = useState("");
  const [patientId, setPatientId] = useState(initialPatientId);
  const [patient, setPatient] = useState<PatientDetailRow | null>(null);
  const [encounters, setEncounters] = useState<EncounterRow[]>([]);
  const [selectedEncounterId, setSelectedEncounterId] = useState("");
  const [requests, setRequests] = useState<ExamRequestRow[]>([]);
  const [docs, setDocs] = useState<ClinicalDocumentRow[]>([]);
  const [loadingPatient, setLoadingPatient] = useState(Boolean(initialPatientId));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(!initialPatientId);
  const [busyPdf, setBusyPdf] = useState(false);

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

  const openEncounters = useMemo(
    () => encounters.filter((e) => e.status === "open"),
    [encounters],
  );

  const reloadClinical = useCallback(
    async (pid: string, pracId: string) => {
      if (!supabase) return;
      const [enc, req, documents] = await Promise.all([
        listEncountersForPatient(supabase, pracId, pid),
        listExamRequestsForPatient(supabase, pid),
        listDocumentsForPatient(supabase, pid, "exam_request"),
      ]);
      setEncounters(enc);
      setRequests(req);
      setDocs(documents.rows);
      const open = enc.filter((e) => e.status === "open");
      setSelectedEncounterId((prev) => {
        if (prev && open.some((e) => e.id === prev)) return prev;
        return open[0]?.id ?? "";
      });
    },
    [supabase],
  );

  const loadPatient = useCallback(
    async (id: string) => {
      if (!supabase || !id || !membership?.practiceId) {
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
        await reloadClinical(detail.id, membership.practiceId);
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
    [membership?.practiceId, reloadClinical, supabase],
  );

  useEffect(() => {
    if (membership?.practiceId && !practiceId) setPracticeId(membership.practiceId);
  }, [membership, practiceId]);

  useEffect(() => {
    if (initialPatientId && canView && membership?.practiceId) {
      void loadPatient(initialPatientId);
    }
  }, [canView, initialPatientId, loadPatient, membership?.practiceId]);

  function onSelectPatient(row: PatientListRow) {
    void loadPatient(row.id);
  }

  function clearPatient() {
    setPatient(null);
    setPatientId("");
    setEncounters([]);
    setRequests([]);
    setDocs([]);
    setSelectedEncounterId("");
    setShowSearch(true);
    setError(null);
    setNotice(null);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("patientId");
      window.history.replaceState({}, "", url.toString());
    }
  }

  async function onViewPdf(doc: ClinicalDocumentRow) {
    if (!supabase || !doc.pdfStoragePath) {
      setError(!doc.pdfStoragePath ? "PDF ainda não anexado a este documento." : "Supabase indisponível.");
      return;
    }
    setBusyPdf(true);
    setError(null);
    try {
      const signed = await createSignedDocumentUrl(supabase, doc.pdfStoragePath);
      if (signed.error || !signed.url) {
        setError(signed.error ?? "Não foi possível abrir o PDF.");
        return;
      }
      window.open(signed.url, "_blank", "noopener,noreferrer");
      setNotice("PDF aberto (URL assinada — bucket privado).");
    } finally {
      setBusyPdf(false);
    }
  }

  if (authorizationLoading) {
    return <p className="text-sm text-lotus-600">Carregando exames…</p>;
  }

  if (!supabase) {
    return <p className="text-sm text-lotus-600">Supabase não configurado.</p>;
  }

  if (!canView) {
    return (
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">Médico</p>
        <h1 className="page-title mt-1">Exames</h1>
        <p className="mt-3 text-sm text-rose-800">Sem permissão para acessar o módulo de exames.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-hidden">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">Médico</p>
        <h1 className="page-title mt-1">Exames</h1>
        <p className="page-sub mt-2">
          Pedidos clínicos e resultados/anexos são objetos distintos. Novo pedido exige atendimento
          aberto (RPC C040.9 — sem encounter artificial nesta tela). SNCR e ICP-Brasil não fazem
          parte deste módulo.
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
        <StatusMessage error={error} notice={notice} />
      </div>

      {!patient || showSearch ? (
        <div className="mt-4">
          <PatientSearchPanel
            supabase={supabase}
            title="Pesquisar paciente"
            hint="Selecione a paciente para consultar pedidos ou criar novo pedido."
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

      {patient ? (
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
            <RowActions
              primary={{
                id: "chart",
                label: "Abrir prontuário",
                href: patientChartHref(patient.id),
              }}
              secondary={
                [{ id: "swap", label: "Trocar paciente", onClick: clearPatient }] satisfies OverflowItem[]
              }
              compact={false}
            />
          </div>
        </section>
      ) : null}

      {patient ? (
        <section className="card mt-4">
          <h2 className="text-base font-semibold text-lotus-900">Pedidos anteriores</h2>
          <p className="mt-1 text-sm text-lotus-600">
            Pedido de exame (solicitação) — distinto de resultado/anexo.
          </p>
          {requests.length === 0 ? (
            <p className="mt-3 text-sm text-lotus-600">Nenhum pedido de exame encontrado.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {requests.map((req) => {
                const groupNames = [
                  ...new Set(
                    req.items.map((i) => i.groupName).filter((n): n is string => Boolean(n)),
                  ),
                ];
                const doc = docs.find(
                  (d) => d.sourceId === req.id && d.status === "finalized",
                );
                return (
                  <li
                    key={req.id}
                    className="rounded-xl border border-lotus-100 bg-white px-3 py-3 text-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-lotus-950">
                          {formatDateTime(req.createdAt)} · {REQUEST_STATUS_LABEL[req.status]}
                        </p>
                        <p className="text-xs text-lotus-600">
                          {groupNames.length > 0
                            ? `Grupo: ${groupNames.join(", ")}`
                            : "Sem grupo"}
                          {" · "}
                          {req.items.length} exame(s)
                          {req.clinicalIndication
                            ? ` · Indicação: ${req.clinicalIndication}`
                            : ""}
                        </p>
                        {doc ? (
                          <p className="mt-1 text-xs text-lotus-500">
                            Documento v{doc.version}
                            {doc.availableToPatient ? " · portal" : ""}
                          </p>
                        ) : null}
                      </div>
                      <RowActions
                        primary={{
                          id: "encounter",
                          label: "Ver no atendimento",
                          href: `/app/records/${req.encounterId}?from=exams&patientId=${patient.id}`,
                          variant: "secondary",
                        }}
                        secondary={
                          doc?.pdfStoragePath
                            ? [
                                {
                                  id: "pdf",
                                  label: "Documento / PDF",
                                  disabled: busyPdf,
                                  onClick: () => void onViewPdf(doc),
                                },
                              ]
                            : []
                        }
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {patient && canManage ? (
        <section className="card mt-4">
          <h2 className="text-base font-semibold text-lotus-900">Novo pedido</h2>
          {openEncounters.length === 0 ? (
            <div className="mt-3 space-y-2 text-sm text-lotus-700">
              <p>
                Não há atendimento aberto para esta paciente. O pedido de exames da arquitetura
                atual exige encounter aberto — sem criar encounter artificial nesta tela.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link href="/app/agenda" className={buttonClass}>
                  Ir à Agenda
                </Link>
                <Link
                  href={patientChartHref(patient.id)}
                  className={ghostButtonClass}
                >
                  Abrir prontuário
                </Link>
              </div>
            </div>
          ) : (
            <>
              <label className="mt-3 block text-sm text-lotus-800">
                Atendimento aberto
                <select
                  className="mt-1 w-full max-w-lg rounded-xl border border-lotus-200 bg-white px-3 py-2"
                  value={selectedEncounterId}
                  onChange={(event) => setSelectedEncounterId(event.target.value)}
                >
                  {openEncounters.map((enc) => (
                    <option key={enc.id} value={enc.id}>
                      {formatDateTime(enc.createdAt)} · {ENCOUNTER_STATUS_LABEL[enc.status]}
                    </option>
                  ))}
                </select>
              </label>
              {selectedEncounterId ? (
                <ExamRequestPanel
                  key={selectedEncounterId}
                  supabase={supabase}
                  practiceId={membership?.practiceId ?? practiceId}
                  encounterId={selectedEncounterId}
                  locked={false}
                  canEdit={canManage}
                />
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {patient && membership ? (
        <ClinicalExamsPanel
          supabase={supabase}
          organizationId={
            patient.organizationId ||
            membership.practice?.organizationId ||
            authorization?.profile?.organizationId ||
            ""
          }
          practiceId={membership.practiceId}
          patientId={patient.id}
          encounterId={selectedEncounterId || null}
          canAnalyze={canManage}
          canAttach={
            canManage || Boolean(authorization && hasStaffRole(authorization, "secretary"))
          }
          attachSource="secretaria"
        />
      ) : null}
    </div>
  );
}
