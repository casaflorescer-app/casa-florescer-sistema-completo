"use client";

/**
 * C040.10 — Prontuário centrado na paciente (visão longitudinal).
 *
 * PACIENTE = identificação · PRONTUÁRIO = esta visão · ENCOUNTER = atendimento
 * via EncounterWorkspace em /app/records/[encounterId].
 * Não duplica clinical_notes / receitas / exames / documentos.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { isCasaBrowserAuth } from "@/lib/auth/casa-mode";
import { loadPatientChartCasa } from "@/lib/casa/actions";
import { createClient } from "@/lib/supabase/client";
import { hasStaffRole } from "@/lib/auth/access";
import { formatIsoDateBr, formatPhone } from "@/lib/patients/format";
import {
  getPatient,
  maskCpf,
  patientChartHref,
  type PatientDetailRow,
} from "@/lib/patients/directory";
import {
  ENCOUNTER_STATUS_LABEL,
  listEncountersForPatient,
  type EncounterRow,
} from "@/lib/attendance/directory";
import {
  loadPatientClinicalSummary,
  type PatientClinicalSummaryData,
} from "@/lib/attendance/patient-summary";
import { listExamOrdersForPatient } from "@/lib/exams/directory";
import { listPrescriptionsForPatient } from "@/lib/prescriptions/directory";
import { listOrientationsForPatient } from "@/lib/orientations/directory";
import { listExamRequestsForPatient } from "@/lib/attendance/clinical-support-directory";
import { formatDateTime } from "@/lib/platform/format";
import { PatientClinicalSummary } from "@/components/attendance/PatientClinicalSummary";
import { EncounterTimeline } from "@/components/attendance/EncounterTimeline";
import { PatientSearchPanel } from "@/components/attendance/PatientSearchPanel";
import { ClinicalPrescriptionPanel } from "@/components/prescriptions/ClinicalPrescriptionPanel";
import { WhatsAppAction } from "@/components/whatsapp/WhatsAppAction";
import { buildAdministrativeHelloMessage } from "@/lib/whatsapp/messages";
import { ClinicalExamsPanel } from "@/components/exams/ClinicalExamsPanel";
import { StatusMessage, buttonClass, ghostButtonClass } from "@/components/platform/Ui";
import { RowActions } from "@/components/ui/RowActions";
import { Patient360Overview } from "@/components/patients/Patient360Overview";
import {
  loadPatient360Snapshot,
  type Patient360Snapshot,
} from "@/lib/patients/patient-360";
type TabId = "resumo" | "historico" | "receitas" | "exames" | "orientacoes";

export function PatientChart({ patientId }: { patientId: string }) {
  const { authorization, authorizationLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [practiceId, setPracticeId] = useState("");
  const [patient, setPatient] = useState<PatientDetailRow | null>(null);
  const [summary, setSummary] = useState<PatientClinicalSummaryData | null>(null);
  const [encounters, setEncounters] = useState<EncounterRow[]>([]);
  const [prescriptions, setPrescriptions] = useState<
    { id: string; status: string; when: string }[]
  >([]);
  const [exams, setExams] = useState<{ id: string; title: string; when: string }[]>([]);
  const [examRequests, setExamRequests] = useState<
    { id: string; status: string; when: string; indication: string | null; itemCount: number }[]
  >([]);
  const [orientations, setOrientations] = useState<
    { id: string; title: string; when: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("resumo");
  const [showSearch, setShowSearch] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "signed">("all");
  const [overview, setOverview] = useState<Patient360Snapshot | null>(null);

  const physicianMemberships = useMemo(
    () =>
      (authorization?.memberships ?? []).filter(
        (item) => item.role === "physician" && item.professional?.id,
      ),
    [authorization],
  );

  const activeMembership = useMemo(() => {
    if (!physicianMemberships.length) return null;
    return (
      physicianMemberships.find((item) => item.practiceId === practiceId) ??
      physicianMemberships[0]
    );
  }, [physicianMemberships, practiceId]);

  const load = useCallback(async () => {
    const casa = isCasaBrowserAuth();
    if ((!supabase && !casa) || !authorization) {
      setLoading(false);
      return;
    }
    if (!hasStaffRole(authorization, "physician")) {
      setError("O prontuário clínico está disponível apenas para médicas autorizadas.");
      setLoading(false);
      return;
    }
    const membership = practiceId
      ? physicianMemberships.find((item) => item.practiceId === practiceId)
      : physicianMemberships[0];
    if (!membership?.practiceId) {
      setError("Nenhuma prática médica vinculada ao seu perfil.");
      setLoading(false);
      return;
    }
    if (!practiceId) setPracticeId(membership.practiceId);

    setLoading(true);
    setError(null);
    if (casa) {
      try {
        const chart = await loadPatientChartCasa({
          patientId,
          practiceId: membership.practiceId,
        });
        if (!chart.patient) {
          setPatient(null);
          setSummary(null);
          setEncounters([]);
          setError("Paciente não encontrada ou sem permissão para visualização.");
          return;
        }
        setPatient(chart.patient);
        setSummary(chart.summary);
        setOverview(null);
        setEncounters(chart.encounters);
        setPrescriptions(chart.prescriptions);
        setExams(chart.exams);
        setExamRequests(chart.examRequests);
        setOrientations(chart.orientations);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Não foi possível abrir o prontuário.");
      } finally {
        setLoading(false);
      }
      return;
    }
    if (!supabase) return;
    try {
      const detail = await getPatient(supabase, patientId);
      if (!detail) {
        setPatient(null);
        setSummary(null);
        setEncounters([]);
        setError("Paciente não encontrada ou sem permissão para visualização.");
        return;
      }
      setPatient(detail);

      const [sum, enc, rx, examRows, examReqs, ori, snap] = await Promise.all([
        loadPatientClinicalSummary(supabase, {
          practiceId: membership.practiceId,
          patientId,
        }),
        listEncountersForPatient(supabase, membership.practiceId, patientId),
        listPrescriptionsForPatient(supabase, patientId).catch(() => []),
        listExamOrdersForPatient(supabase, patientId).catch(() => []),
        listExamRequestsForPatient(supabase, patientId).catch(() => []),
        listOrientationsForPatient(supabase, patientId).catch(() => []),
        loadPatient360Snapshot(supabase, {
          patientId,
          practiceId: membership.practiceId,
          includeClinical: true,
        }).catch(() => null),
      ]);
      setSummary(sum);
      setOverview(snap);
      setEncounters(enc);
      setPrescriptions(
        rx.slice(0, 40).map((item) => ({
          id: item.id,
          status: item.status,
          when: item.publishedToPatientAt || item.signedAt || item.createdAt,
        })),
      );
      setExams(
        examRows.slice(0, 40).map((item) => ({
          id: item.id,
          title: item.title,
          when: item.documentDate || item.receivedAt || item.updatedAt || item.createdAt || "",
        })),
      );
      setExamRequests(
        examReqs.slice(0, 40).map((item) => ({
          id: item.id,
          status: item.status,
          when: item.createdAt,
          indication: item.clinicalIndication,
          itemCount: item.items.length,
        })),
      );
      setOrientations(
        ori.slice(0, 40).map((item) => ({
          id: item.id,
          title: item.title,
          when: item.updatedAt || item.createdAt,
        })),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Não foi possível abrir o prontuário.",
      );
    } finally {
      setLoading(false);
    }
  }, [authorization, patientId, practiceId, physicianMemberships, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredEncounters = useMemo(() => {
    if (statusFilter === "all") return encounters;
    return encounters.filter((item) => item.status === statusFilter);
  }, [encounters, statusFilter]);

  if (authorizationLoading || (loading && !patient)) {
    return <p className="text-sm text-lotus-600">Carregando prontuário…</p>;
  }

  if (!supabase && !isCasaBrowserAuth()) {
    return <p className="text-sm text-rose-800">Autenticação não configurada.</p>;
  }

  return (
    <div className="overflow-x-hidden">
      <header className="card" data-patient-360="true">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">
          Prontuário
        </p>
        <div className="mt-1 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="page-title">{patient?.fullName ?? "Paciente"}</h1>
            {patient ? (
              <p className="mt-2 text-sm text-lotus-700">
                {patient.birthDate ? `Nascimento ${formatIsoDateBr(patient.birthDate)}` : "Nascimento —"}
                {" · "}
                CPF {maskCpf(patient.cpf)}
                {patient.phone ? ` · ${formatPhone(patient.phone)}` : ""}
              </p>
            ) : null}
            <p className="mt-2 max-w-2xl text-sm text-lotus-600">
              Histórico clínico e assistencial desta paciente. Para dados cadastrais (telefone,
              endereço, foto), use o cadastro. Para registrar a consulta do dia, use a agenda.
            </p>
          </div>
          {patient ? (
            <RowActions
              compact={false}
              primary={{
                id: "agenda",
                label: "Agendar",
                href: `/app/agenda?patientId=${patient.id}`,
              }}
              secondary={[
                {
                  id: "new-encounter",
                  label: "Novo atendimento (via agenda)",
                  href: `/app/agenda?patientId=${patient.id}`,
                },
                {
                  id: "cadastro",
                  label: "Abrir cadastro",
                  href: `/app/patients/${patient.id}`,
                },
                { id: "records", label: "Buscar no prontuário", href: "/app/records" },
                {
                  id: "search",
                  label: showSearch ? "Ocultar pesquisa" : "Pesquisar outra paciente",
                  onClick: () => setShowSearch((open) => !open),
                },
                { id: "reload", label: "Atualizar", onClick: () => void load() },
              ]}
            />
          ) : null}
        </div>
        {patient ? (
          <div className="mt-3">
            <WhatsAppAction
              phone={patient.phone}
              recipientName={patient.fullName}
              message={buildAdministrativeHelloMessage(patient.fullName)}
              compact
            />
          </div>
        ) : null}
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

      {showSearch ? (
        <div className="mt-4">
          <PatientSearchPanel
            supabase={supabase}
            title="Trocar paciente"
            excludePatientId={patientId}
            autoFocus
          />
        </div>
      ) : null}

      <div className="mt-4">
        <StatusMessage error={error} />
      </div>

      {!error && patient ? (
        <>
          <nav
            className="mt-4 flex flex-wrap gap-2"
            aria-label="Seções do prontuário"
          >
            {(
              [
                ["resumo", "Resumo"],
                ["historico", "Histórico"],
                ["receitas", "Receitas"],
                ["exames", "Exames"],
                ["orientacoes", "Orientações"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={tab === id ? buttonClass : ghostButtonClass}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>

          {tab === "resumo" ? (
            <>
              <Patient360Overview snapshot={overview} loading={loading && !overview} />
              <PatientClinicalSummary summary={summary} pregnancy={null} loading={loading} />
            </>
          ) : null}

          {tab === "historico" ? (
            <section className="mt-4 space-y-4">
              <div className="card">
                <h2 className="text-base font-semibold text-lotus-900">
                  Histórico de atendimentos
                </h2>
                <p className="mt-1 text-sm text-lotus-600">
                  Atendimentos desta paciente nesta prática. Abrir continua o registro clínico
                  correspondente.
                </p>
                <label className="mt-3 block text-sm text-lotus-800">
                  Status
                  <select
                    className="mt-1 w-full max-w-xs rounded-xl border border-lotus-200 bg-white px-3 py-2"
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(event.target.value as "all" | "open" | "signed")
                    }
                  >
                    <option value="all">Todos</option>
                    <option value="open">Em aberto</option>
                    <option value="signed">Assinados</option>
                  </select>
                </label>
                {filteredEncounters.length === 0 ? (
                  <p className="mt-3 text-sm text-lotus-600">Nenhum atendimento neste filtro.</p>
                ) : (
                  <ul className="mt-4 space-y-2">
                    {filteredEncounters.map((row) => (
                      <li
                        key={row.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-lotus-100 bg-white px-3 py-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-lotus-950">
                            {formatDateTime(row.signedAt ?? row.createdAt)}
                            {row.returnOfEncounterId ? " · Retorno" : ""}
                          </p>
                          <p className="text-xs text-lotus-600">
                            {ENCOUNTER_STATUS_LABEL[row.status]}
                          </p>
                          {row.returnOfEncounterId ? (
                            <p className="mt-1 text-xs text-lotus-600">
                              <Link
                                href={`/app/records/${row.returnOfEncounterId}?from=patient&patientId=${patientId}`}
                                className="underline-offset-2 hover:underline"
                              >
                                Atendimento de origem
                              </Link>
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {!row.returnOfEncounterId && row.status === "signed" ? (
                            <Link
                              href={`/app/records/${row.id}?from=patient&patientId=${patientId}#retorno`}
                              className={ghostButtonClass}
                            >
                              Retorno
                            </Link>
                          ) : null}
                          <Link
                            href={`/app/records/${row.id}?from=patient&patientId=${patientId}`}
                            className={row.status === "open" ? buttonClass : ghostButtonClass}
                          >
                            {row.status === "open"
                              ? row.returnOfEncounterId
                                ? "Continuar retorno"
                                : "Continuar atendimento"
                              : "Visualizar atendimento"}
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {supabase ? (
              <EncounterTimeline
                supabase={supabase}
                encounters={filteredEncounters}
                currentEncounterId=""
                loading={loading}
              />
              ) : null}
            </section>
          ) : null}

          {tab === "receitas" ? (
            <section className="mt-4 space-y-4 overflow-x-hidden">
              <div className="card flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-lotus-900">Receitas</h2>
                  <p className="mt-1 text-sm text-lotus-600">
                    Mesmo patientId do prontuário. Emissão com revisão, documento e PDF no painel abaixo.
                  </p>
                  {prescriptions.length === 0 ? (
                    <p className="mt-2 text-sm text-lotus-600">Nenhuma receita encontrada.</p>
                  ) : (
                    <p className="mt-2 text-xs text-lotus-500">
                      {prescriptions.length} registro(s) recente(s) no histórico.
                    </p>
                  )}
                </div>
                <Link
                  href={`/app/prescriptions?patientId=${patientId}`}
                  className={ghostButtonClass}
                >
                  Abrir módulo Receitas
                </Link>
              </div>
              {activeMembership?.professional?.id && patient && supabase ? (
                <ClinicalPrescriptionPanel
                  supabase={supabase}
                  organizationId={
                    patient.organizationId ||
                    activeMembership.practice?.organizationId ||
                    authorization?.profile?.organizationId ||
                    ""
                  }
                  practiceId={activeMembership.practiceId}
                  patientId={patientId}
                  professionalId={activeMembership.professional.id}
                  canManage={Boolean(authorization && hasStaffRole(authorization, "physician"))}
                />
              ) : null}
            </section>
          ) : null}

          {tab === "exames" ? (
            <section className="mt-4 space-y-4 overflow-x-hidden">
              <div className="card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-lotus-900">Exames</h2>
                    <p className="mt-1 text-sm text-lotus-600">
                      Pedido clínico é diferente do resultado/anexo. Para solicitar um exame,
                      primeiro abra o atendimento da paciente.
                    </p>
                  </div>
                  <Link href={`/app/exams?patientId=${patientId}`} className={buttonClass}>
                    Novo pedido
                  </Link>
                </div>
                <h3 className="mt-4 text-sm font-semibold text-lotus-900">Pedidos (solicitação)</h3>
                {examRequests.length === 0 ? (
                  <p className="mt-2 text-sm text-lotus-600">Nenhum pedido de exame encontrado.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {examRequests.map((item) => (
                      <li
                        key={item.id}
                        className="rounded-xl border border-lotus-100 bg-white px-3 py-3 text-sm"
                      >
                        <p className="font-medium text-lotus-950">
                          Pedido ·{" "}
                          {item.status === "confirmed"
                            ? "Solicitado"
                            : item.status === "draft"
                              ? "Rascunho"
                              : item.status}
                          {" · "}
                          {item.itemCount} exame(s)
                        </p>
                        <p className="text-xs text-lotus-600">{formatDateTime(item.when)}</p>
                        {item.indication ? (
                          <p className="mt-1 text-xs text-lotus-700">
                            Indicação: {item.indication}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
                <h3 className="mt-4 text-sm font-semibold text-lotus-900">
                  Resultados / anexos
                </h3>
                {exams.length === 0 ? (
                  <p className="mt-2 text-sm text-lotus-600">Nenhum resultado/anexo listado.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {exams.map((item) => (
                      <li
                        key={item.id}
                        className="rounded-xl border border-lotus-100 bg-white px-3 py-3 text-sm"
                      >
                        <p className="font-medium text-lotus-950">Resultado · {item.title}</p>
                        <p className="text-xs text-lotus-600">
                          {item.when ? formatDateTime(item.when) : "—"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {activeMembership && patient && (supabase || isCasaBrowserAuth()) ? (
                <ClinicalExamsPanel
                  supabase={supabase}
                  organizationId={
                    patient.organizationId ||
                    activeMembership.practice?.organizationId ||
                    authorization?.profile?.organizationId ||
                    ""
                  }
                  practiceId={activeMembership.practiceId}
                  patientId={patientId}
                  canAnalyze={Boolean(authorization && hasStaffRole(authorization, "physician"))}
                  canAttach={Boolean(authorization && hasStaffRole(authorization, "physician"))}
                  attachSource="secretaria"
                />
              ) : null}
            </section>
          ) : null}

          {tab === "orientacoes" ? (
            <section className="card mt-4">
              <h2 className="text-base font-semibold text-lotus-900">Orientações</h2>
              {orientations.length === 0 ? (
                <p className="mt-3 text-sm text-lotus-600">Nenhuma orientação listada.</p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {orientations.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-xl border border-lotus-100 bg-white px-3 py-3 text-sm"
                    >
                      <p className="font-medium text-lotus-950">{item.title}</p>
                      <p className="text-xs text-lotus-600">{formatDateTime(item.when)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </>
      ) : null}

      {/* Âncora estável para testes estruturais / deep-link */}
      <p className="sr-only" data-patient-chart-href={patientChartHref(patientId)}>
        patient-chart
      </p>
    </div>
  );
}
