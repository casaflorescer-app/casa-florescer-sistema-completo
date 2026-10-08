"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { hasStaffRole } from "@/lib/auth/access";
import type { AuthorizationContext } from "@/lib/auth/authorization";
import { dayBoundsIso } from "@/components/attendance/agenda-display";
import {
  clinicalNoteUpsert,
  encounterSign,
  getAppointment,
  getEncounter,
  getEncounterPregnancy,
  linkEncounterToPregnancy,
  listAppointments,
  listClinicalNotes,
  getLatestClinicalNote,
  unlinkEncounterFromPregnancy,
  appointmentRecordActualEnd,
  listEncountersForPatient,
  recalculateDayPredictions,
  DEFAULT_NOTE_TEMPLATE,
  type AppointmentRow,
  type ClinicalNoteRow,
  type EncounterRow,
  type PregnancyContext,
} from "@/lib/attendance/directory";
import {
  loadPatientClinicalSummary,
  type PatientClinicalSummaryData,
} from "@/lib/attendance/patient-summary";
import {
  EMPTY_ANAMNESIS,
  EMPTY_CHIEF_COMPLAINT,
  EMPTY_PHYSICAL_EXAM,
  TEMPLATE_ANAMNESIS_ENCOUNTER,
  TEMPLATE_CHIEF_COMPLAINT,
  TEMPLATE_PHYSICAL_EXAM,
  parseAnamnesis,
  parseChiefComplaint,
  parsePhysicalExam,
  type AnamnesisEncounterForm,
  type ChiefComplaintForm,
  type PhysicalExamForm,
} from "@/lib/attendance/clinical-forms";
import { loadPriorAnamnesis, type PriorAnamnesisRef } from "@/lib/attendance/prior-clinical";
import { listPatients } from "@/lib/patients/directory";
import { formatIsoDateBr } from "@/lib/patients/format";
import {
  describePregnancyEvent,
  listPatientPregnancies,
  listPregnancyEvents,
  listProfessionalLabels,
  listProfileNames,
  PREGNANCY_EVENT_LABEL,
  PREGNANCY_RISK_LABEL,
  PREGNANCY_STATUS_LABEL,
  type PregnancyRow,
  type ProfessionalLabel,
} from "@/lib/pregnancies/directory";
import { formatDateTime } from "@/lib/platform/format";
import { buttonClass, ghostButtonClass, StatusMessage } from "@/components/platform/Ui";
import { AnamnesisPanel } from "@/components/attendance/AnamnesisPanel";
import { ChiefComplaintPanel } from "@/components/attendance/ChiefComplaintPanel";
import { ClinicalNoteEditor } from "@/components/attendance/ClinicalNoteEditor";
import { ContextAssistencial } from "@/components/attendance/ContextAssistencial";
import { EncounterActions } from "@/components/attendance/EncounterActions";
import { EncounterHeader } from "@/components/attendance/EncounterHeader";
import { EncounterTimeline } from "@/components/attendance/EncounterTimeline";
import { PatientClinicalSummary } from "@/components/attendance/PatientClinicalSummary";
import { PhysicalExamPanel } from "@/components/attendance/PhysicalExamPanel";
import { WorkspaceComingSoon } from "@/components/attendance/WorkspaceComingSoon";
import { WorkspaceSectionNav } from "@/components/attendance/WorkspaceSectionNav";
import {
  ObstetricHistory,
  type ObstetricHistoryItem,
} from "@/components/attendance/ObstetricHistory";
import {
  PregnancyLinkDialog,
  type PregnancyLinkChoice,
} from "@/components/attendance/PregnancyLinkDialog";
import {
  EMPTY_SOAP,
  sameSoap,
  soapFromBody,
  soapHasContent,
  soapToBody,
  type SoapNote,
} from "@/components/attendance/soap";
import { ClinicalOrientationsPanel } from "@/components/orientations/ClinicalOrientationsPanel";
import { ClinicalExamsPanel } from "@/components/exams/ClinicalExamsPanel";
import { ClinicalPrescriptionPanel } from "@/components/prescriptions/ClinicalPrescriptionPanel";

function viewerIsEncounterProfessional(
  authorization: AuthorizationContext | null,
  encounter: EncounterRow,
): boolean {
  if (!authorization || !hasStaffRole(authorization, "physician")) return false;
  return authorization.memberships.some(
    (item) =>
      item.role === "physician" &&
      item.practiceId === encounter.practiceId &&
      item.professional?.id === encounter.professionalId,
  );
}

function choiceDate(value: string | null): string {
  if (!value) return "—";
  const formatted = formatIsoDateBr(value.slice(0, 10));
  return formatted || "—";
}

async function readObstetricHistory(
  supabase: SupabaseClient,
  pregnancyId: string,
  labels: ProfessionalLabel[],
): Promise<{ items: ObstetricHistoryItem[]; error: string | null }> {
  try {
    const events = await listPregnancyEvents(supabase, pregnancyId);
    const visible = await listProfessionalLabels(supabase).catch(() => labels);
    const names = new Map(labels.map((item) => [item.id, item.fullName]));
    for (const item of visible) names.set(item.id, item.fullName);
    const actors = await listProfileNames(
      supabase,
      events.map((item) => item.actorId).filter((id): id is string => Boolean(id)),
    );
    return {
      items: events.map((item) => ({
        id: item.id,
        label: PREGNANCY_EVENT_LABEL[item.kind],
        occurredAt: item.occurredAt,
        detail: describePregnancyEvent(item, names, actors),
      })),
      error: null,
    };
  } catch (caught) {
    return {
      items: [],
      error: caught instanceof Error ? caught.message : "Não foi possível carregar o histórico da gestação.",
    };
  }
}

function toLinkChoice(row: PregnancyRow): PregnancyLinkChoice {
  return {
    id: row.id,
    dum: choiceDate(row.lmpDate),
    dpp: choiceDate(row.clinicalEdd ?? row.calculatedEdd),
    status: PREGNANCY_STATUS_LABEL[row.status],
    risk: row.risk ? PREGNANCY_RISK_LABEL[row.risk] : "—",
    primaryName: row.primaryName ?? "—",
  };
}

export function EncounterWorkspace({ encounterId }: { encounterId: string }) {
  const { authorization } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [encounter, setEncounter] = useState<EncounterRow | null>(null);
  const [notes, setNotes] = useState<ClinicalNoteRow[]>([]);
  const [soap, setSoap] = useState<SoapNote>(EMPTY_SOAP);
  const [savedSoap, setSavedSoap] = useState<SoapNote>(EMPTY_SOAP);
  const [patientName, setPatientName] = useState<string | null>(null);
  const [professionalName, setProfessionalName] = useState<string | null>(null);
  const [pregnancy, setPregnancy] = useState<PregnancyContext | null>(null);
  const [pregnancyLinked, setPregnancyLinked] = useState(false);
  const [primaryProfessionalName, setPrimaryProfessionalName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [linkMode, setLinkMode] = useState<"link" | "unlink" | null>(null);
  const [linkChoices, setLinkChoices] = useState<PregnancyLinkChoice[]>([]);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [obstetricHistory, setObstetricHistory] = useState<ObstetricHistoryItem[]>([]);
  const [obstetricHistoryError, setObstetricHistoryError] = useState<string | null>(null);
  const [attendanceEnded, setAttendanceEnded] = useState(false);
  const [appointmentRow, setAppointmentRow] = useState<AppointmentRow | null>(null);
  const [summary, setSummary] = useState<PatientClinicalSummaryData | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [timeline, setTimeline] = useState<EncounterRow[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [chiefComplaint, setChiefComplaint] = useState<ChiefComplaintForm>(EMPTY_CHIEF_COMPLAINT);
  const [anamnesis, setAnamnesis] = useState<AnamnesisEncounterForm>(EMPTY_ANAMNESIS);
  const [physicalExam, setPhysicalExam] = useState<PhysicalExamForm>(EMPTY_PHYSICAL_EXAM);
  const [priorAnamnesis, setPriorAnamnesis] = useState<PriorAnamnesisRef | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!supabase) {
      setError("Autenticação não configurada neste ambiente.");
      setLoading(false);
      return;
    }
    if (!quiet) setLoading(true);
    const row = await getEncounter(supabase, encounterId);
    if (!row) {
      setEncounter(null);
      setAppointmentRow(null);
      setPregnancy(null);
      setPregnancyLinked(false);
      setPrimaryProfessionalName(null);
      setObstetricHistory([]);
      setObstetricHistoryError(null);
      setAttendanceEnded(false);
      setChiefComplaint(EMPTY_CHIEF_COMPLAINT);
      setAnamnesis(EMPTY_ANAMNESIS);
      setPhysicalExam(EMPTY_PHYSICAL_EXAM);
      setPriorAnamnesis(null);
      setError("Atendimento não encontrado ou sem permissão de leitura.");
      setLoading(false);
      return;
    }
    const [
      latest,
      history,
      patients,
      professionals,
      pregnancyContext,
      linkRow,
      appointment,
      complaintNote,
      anamnesisNote,
      examNote,
    ] = await Promise.all([
      getLatestClinicalNote(supabase, encounterId, DEFAULT_NOTE_TEMPLATE),
      listClinicalNotes(supabase, encounterId),
      listPatients(supabase).catch(() => []),
      listProfessionalLabels(supabase, row.practiceId).catch(() => []),
      getEncounterPregnancy(supabase, encounterId),
      supabase.from("encounters").select("pregnancy_id").eq("id", encounterId).maybeSingle(),
      row.appointmentId ? getAppointment(supabase, row.appointmentId) : Promise.resolve(null),
      getLatestClinicalNote(supabase, encounterId, TEMPLATE_CHIEF_COMPLAINT),
      getLatestClinicalNote(supabase, encounterId, TEMPLATE_ANAMNESIS_ENCOUNTER),
      getLatestClinicalNote(supabase, encounterId, TEMPLATE_PHYSICAL_EXAM),
    ]);
    setAppointmentRow(appointment);
    setAttendanceEnded(Boolean(appointment?.actualEndAt));
    const nextSoap = soapFromBody(latest?.body);
    setEncounter(row);
    setNotes(history.filter((note) => note.templateCode === DEFAULT_NOTE_TEMPLATE));
    setSoap(nextSoap);
    setSavedSoap(nextSoap);
    setChiefComplaint(parseChiefComplaint(complaintNote?.body));
    setAnamnesis(parseAnamnesis(anamnesisNote?.body));
    setPhysicalExam(parsePhysicalExam(examNote?.body));
    setPatientName(patients.find((item) => item.id === row.patientId)?.fullName ?? null);
    setProfessionalName(
      professionals.find((item) => item.id === row.professionalId)?.fullName ?? null,
    );
    const pregnancyId = linkRow.data?.pregnancy_id;
    setPregnancy(pregnancyContext);
    setPregnancyLinked(
      Boolean(linkRow.error) || (typeof pregnancyId === "string" && pregnancyId.length > 0),
    );
    setPrimaryProfessionalName(
      pregnancyContext
        ? professionals.find((item) => item.id === pregnancyContext.primaryProfessionalId)?.fullName ??
            null
        : null,
    );
    const obstetric = pregnancyContext
      ? await readObstetricHistory(supabase, pregnancyContext.id, professionals)
      : { items: [], error: null };
    setObstetricHistory(obstetric.items);
    setObstetricHistoryError(obstetric.error);
    setError(null);
    setLoading(false);

    setSummaryLoading(true);
    setTimelineLoading(true);
    const [summaryData, timelineRows, prior] = await Promise.all([
      loadPatientClinicalSummary(supabase, {
        practiceId: row.practiceId,
        patientId: row.patientId,
        currentEncounterId: row.id,
        pregnancy: pregnancyContext,
      }).catch(() => null),
      listEncountersForPatient(supabase, row.practiceId, row.patientId).catch(() => []),
      loadPriorAnamnesis(supabase, {
        practiceId: row.practiceId,
        patientId: row.patientId,
        currentEncounterId: row.id,
      }).catch(() => null),
    ]);
    setSummary(summaryData);
    setTimeline(timelineRows);
    setPriorAnamnesis(prior);
    setSummaryLoading(false);
    setTimelineLoading(false);
  }, [encounterId, supabase]);

  const refreshPregnancy = useCallback(async () => {
    if (!supabase || !encounter) return;
    const [pregnancyContext, linkRow, professionals] = await Promise.all([
      getEncounterPregnancy(supabase, encounter.id),
      supabase.from("encounters").select("pregnancy_id").eq("id", encounter.id).maybeSingle(),
      listProfessionalLabels(supabase, encounter.practiceId).catch(() => []),
    ]);
    const pregnancyId = linkRow.data?.pregnancy_id;
    setPregnancy(pregnancyContext);
    setPregnancyLinked(
      Boolean(linkRow.error) || (typeof pregnancyId === "string" && pregnancyId.length > 0),
    );
    setPrimaryProfessionalName(
      pregnancyContext
        ? professionals.find((item) => item.id === pregnancyContext.primaryProfessionalId)?.fullName ??
            null
        : null,
    );
    const obstetric = pregnancyContext
      ? await readObstetricHistory(supabase, pregnancyContext.id, professionals)
      : { items: [], error: null };
    setObstetricHistory(obstetric.items);
    setObstetricHistoryError(obstetric.error);
  }, [encounter, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const locked = encounter != null && encounter.status !== "open";
  const canOfferPregnancyLink =
    encounter != null && encounter.status === "open" && viewerIsEncounterProfessional(authorization, encounter);

  function closeLink() {
    if (linkBusy) return;
    setLinkMode(null);
    setLinkError(null);
    setLinkChoices([]);
    setLinkLoading(false);
  }

  async function openLink() {
    if (!supabase || !encounter || !canOfferPregnancyLink || busy || linkBusy) return;
    setLinkMode("link");
    setLinkError(null);
    setLinkChoices([]);
    setLinkLoading(true);
    try {
      const rows = await listPatientPregnancies(supabase, encounter.patientId);
      const choices = rows
        .filter((row) => row.practiceId === encounter.practiceId)
        .sort((left, right) => {
          if (left.status === "in_care" && right.status !== "in_care") return -1;
          if (right.status === "in_care" && left.status !== "in_care") return 1;
          return 0;
        })
        .map(toLinkChoice);
      setLinkChoices(choices);
    } catch (caught) {
      setLinkError(
        caught instanceof Error ? caught.message : "Não foi possível carregar as gestações.",
      );
    } finally {
      setLinkLoading(false);
    }
  }

  async function onLink(pregnancyId: string) {
    if (!supabase || !encounter || !canOfferPregnancyLink || linkBusy) return;
    setLinkBusy(true);
    setLinkError(null);
    const result = await linkEncounterToPregnancy(supabase, encounter.id, pregnancyId);
    if (result.error || !result.encounterId) {
      setLinkBusy(false);
      setLinkError(result.error ?? "Não foi possível vincular a gestação.");
      return;
    }
    setLinkMode(null);
    setLinkChoices([]);
    setNotice("Gestação vinculada ao atendimento.");
    setError(null);
    await refreshPregnancy();
    setLinkBusy(false);
  }

  async function onUnlink() {
    if (!supabase || !encounter || !canOfferPregnancyLink || linkBusy) return;
    setLinkBusy(true);
    setLinkError(null);
    const result = await unlinkEncounterFromPregnancy(supabase, encounter.id);
    if (result.error || !result.encounterId) {
      setLinkBusy(false);
      setLinkError(result.error ?? "Não foi possível desvincular a gestação.");
      return;
    }
    setLinkMode(null);
    setNotice("Gestação desvinculada do atendimento.");
    setError(null);
    await refreshPregnancy();
    setLinkBusy(false);
  }

  async function onSave() {
    if (!supabase || !encounter || locked) return;
    if (!soapHasContent(soap)) {
      setError("Preencha ao menos um campo da evolução.");
      setNotice(null);
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await clinicalNoteUpsert(supabase, {
      encounterId: encounter.id,
      body: soapToBody(soap),
      templateCode: "soap_min",
    });
    setBusy(false);
    if (result.error || !result.noteId) {
      setError(result.error ?? "Não foi possível salvar a evolução.");
      return;
    }
    setNotice("Evolução salva.");
    await load(true);
  }

  async function onSign() {
    if (!supabase || !encounter || locked) return;
    if (!sameSoap(soap, savedSoap)) {
      setError("Salve a evolução antes de assinar.");
      setNotice(null);
      return;
    }
    if (!soapHasContent(savedSoap)) {
      setError("Salve a evolução antes de assinar.");
      setNotice(null);
      return;
    }
    if (!window.confirm("Assinar este atendimento? Depois da assinatura a evolução não poderá ser alterada.")) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await encounterSign(supabase, encounter.id);
    setBusy(false);
    if (result.error || !result.encounterId) {
      setError(result.error ?? "Não foi possível assinar o atendimento.");
      return;
    }
    setNotice("Atendimento assinado.");
    await load(true);
  }

  async function onEndAttendance() {
    if (!supabase || !encounter?.appointmentId) {
      setError("Este atendimento não está vinculado a um agendamento.");
      return;
    }
    if (!viewerIsEncounterProfessional(authorization, encounter)) {
      setError("Somente a médica do atendimento pode encerrar.");
      return;
    }
    if (
      !window.confirm(
        "Encerrar o atendimento clinicamente agora? Isso registra o horário real de término (independente da assinatura) e atualiza a previsão da agenda.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await appointmentRecordActualEnd(supabase, encounter.appointmentId);
    if (result.error || !result.row) {
      setBusy(false);
      setError(result.error ?? "Não foi possível registrar o término.");
      return;
    }

    setAppointmentRow(result.row);
    setAttendanceEnded(true);

    // Recalcula a cadeia do dia da profissional sem alterar starts_at/scheduled_*.
    let predictionNotice = "Término clínico registrado.";
    try {
      const dayKey = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
      }).format(new Date(result.row.startsAt));
      const bounds = dayBoundsIso(dayKey);
      if (bounds) {
        const dayAppts = await listAppointments(supabase, {
          practiceId: encounter.practiceId,
          from: bounds.from,
          to: bounds.to,
          professionalId: encounter.professionalId,
        });
        // Inclui o appointment acabado de encerrar (lista pode estar stale se filtro por status).
        const byId = new Map(dayAppts.map((item) => [item.id, item]));
        byId.set(result.row.id, result.row);
        const recalc = await recalculateDayPredictions(supabase, {
          organizationId: encounter.organizationId,
          practiceId: encounter.practiceId,
          appointments: [...byId.values()],
          from: bounds.from,
          to: bounds.to,
          persist: true,
        });
        if (recalc.error) {
          predictionNotice =
            "Término clínico registrado. A previsão da agenda será atualizada na próxima carga da agenda.";
        } else if (recalc.persisted > 0) {
          predictionNotice = `Término clínico registrado. Previsão da agenda atualizada (${recalc.persisted}).`;
        } else {
          predictionNotice = "Término clínico registrado. Sem alteração relevante na previsão.";
        }
      }
    } catch {
      predictionNotice =
        "Término clínico registrado. A previsão da agenda será atualizada na próxima carga da agenda.";
    }

    setBusy(false);
    setNotice(predictionNotice);
  }

  if (loading) {
    return <p className="text-sm text-lotus-600">Carregando atendimento…</p>;
  }

  if (!encounter) {
    return <StatusMessage error={error ?? "Atendimento não encontrado."} />;
  }

  return (
    <div className="overflow-x-hidden pb-8">
      <EncounterHeader
        encounter={encounter}
        patientName={patientName}
        professionalName={professionalName}
        assistential={
          <ContextAssistencial
            pregnancy={pregnancy}
            pregnancyLinked={pregnancyLinked}
            encounterAt={encounter.createdAt}
            primaryProfessionalName={primaryProfessionalName}
            actions={
              canOfferPregnancyLink ? (
                pregnancyLinked ? (
                  <button
                    type="button"
                    className={ghostButtonClass}
                    disabled={busy || linkBusy}
                    onClick={() => {
                      setLinkError(null);
                      setLinkMode("unlink");
                    }}
                  >
                    Desvincular gestação
                  </button>
                ) : (
                  <button
                    type="button"
                    className={ghostButtonClass}
                    disabled={busy || linkBusy}
                    onClick={() => void openLink()}
                  >
                    Vincular gestação
                  </button>
                )
              ) : null
            }
          />
        }
      />
      <WorkspaceSectionNav />
      {linkMode ? (
        <PregnancyLinkDialog
          mode={linkMode}
          choices={linkChoices}
          loading={linkLoading}
          busy={linkBusy}
          error={linkError}
          onClose={closeLink}
          onLink={(pregnancyId) => void onLink(pregnancyId)}
          onUnlink={() => void onUnlink()}
        />
      ) : null}
      {pregnancy ? <ObstetricHistory items={obstetricHistory} error={obstetricHistoryError} /> : null}
      <div className="mt-4">
        <StatusMessage error={error} notice={notice} />
      </div>

      <PatientClinicalSummary
        summary={summary}
        pregnancy={pregnancy}
        loading={summaryLoading}
      />

      {supabase ? (
        <EncounterTimeline
          supabase={supabase}
          encounters={timeline}
          currentEncounterId={encounter.id}
          loading={timelineLoading}
        />
      ) : null}

      {appointmentRow ? (
        <section className="card mt-4 overflow-x-hidden">
          <h2 className="text-base font-semibold text-lotus-900">Tempo do atendimento</h2>
          <p className="mt-1 text-sm text-lotus-600">
            Assinatura documental (`encounter_sign`) e término efetivo (`actual_end_at`) são
            eventos distintos. Horários administrativos permanecem inalterados.
          </p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-lotus-50/80 px-3 py-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-lotus-500">Agendado</dt>
              <dd className="mt-1 text-lg font-semibold text-lotus-950">
                {formatDateTime(appointmentRow.scheduledStartsAt)}
              </dd>
            </div>
            <div className="rounded-xl bg-lotus-50/80 px-3 py-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-lotus-500">Início efetivo</dt>
              <dd className="mt-1 text-lg font-semibold text-lotus-950">
                {appointmentRow.actualStartAt ? formatDateTime(appointmentRow.actualStartAt) : "Aguardando"}
              </dd>
            </div>
            <div className="rounded-xl bg-lotus-50/80 px-3 py-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-lotus-500">Término efetivo</dt>
              <dd className="mt-1 text-lg font-semibold text-lotus-950">
                {appointmentRow.actualEndAt ? formatDateTime(appointmentRow.actualEndAt) : "Em aberto"}
              </dd>
            </div>
            <div className="rounded-xl bg-[#FFF8F5] px-3 py-3 ring-1 ring-[#F0D5C8]">
              <dt className="text-xs font-semibold uppercase tracking-wide text-[#9A5B64]">Duração efetiva</dt>
              <dd className="mt-1 text-lg font-semibold text-[#5C2E35]">
                {appointmentRow.actualStartAt && appointmentRow.actualEndAt
                  ? `${Math.max(
                      0,
                      Math.round(
                        (new Date(appointmentRow.actualEndAt).getTime() -
                          new Date(appointmentRow.actualStartAt).getTime()) /
                          60000,
                      ),
                    )} min`
                  : "—"}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {supabase ? (
        <>
          <ChiefComplaintPanel
            supabase={supabase}
            encounterId={encounter.id}
            locked={locked}
            canEdit={viewerIsEncounterProfessional(authorization, encounter)}
            initial={chiefComplaint}
          />
          <AnamnesisPanel
            supabase={supabase}
            encounterId={encounter.id}
            patientId={encounter.patientId}
            organizationId={encounter.organizationId}
            actorUserId={authorization?.user.id ?? null}
            locked={locked}
            canEdit={viewerIsEncounterProfessional(authorization, encounter)}
            initial={anamnesis}
            prior={priorAnamnesis}
            pregnancyHint={
              pregnancy
                ? `Gestação vinculada · DUM ${choiceDate(pregnancy.lmpDate)} · DPP ${choiceDate(
                    pregnancy.clinicalDueDate ?? pregnancy.estimatedDueDate,
                  )} · ${PREGNANCY_STATUS_LABEL[pregnancy.status]}`
                : null
            }
          />
          <PhysicalExamPanel
            supabase={supabase}
            encounterId={encounter.id}
            locked={locked}
            canEdit={viewerIsEncounterProfessional(authorization, encounter)}
            initial={physicalExam}
          />
        </>
      ) : null}

      <section className="mt-4 space-y-4">
        <div id="soap" className="scroll-mt-16">
          <ClinicalNoteEditor value={soap} locked={locked} onChange={setSoap} />
        </div>
        {notes.length > 0 ? (
          <section className="card overflow-x-hidden">
            <h2 className="text-base font-semibold text-lotus-900">Rascunho SOAP deste atendimento</h2>
            <p className="mt-1 text-xs text-lotus-500">
              Uma nota por template: o contador indica quantas vezes o rascunho foi gravado,
              não um histórico recuperável de textos anteriores.
            </p>
            <ul className="mt-3 space-y-2 text-sm text-lotus-700">
              {notes.map((note) => (
                <li key={note.id}>
                  Rascunho · {note.version}{" "}
                  {note.version === 1 ? "gravação" : "gravações"} · iniciado em{" "}
                  {formatDateTime(note.createdAt)}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </section>

      <WorkspaceComingSoon id="gravacao" title="Gravação / transcrição" stage="C040.3">
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={buttonClass} disabled title="Disponível no C040.3">
            Iniciar gravação
          </button>
          <button type="button" className={ghostButtonClass} disabled>
            Pausar
          </button>
          <button type="button" className={ghostButtonClass} disabled>
            Continuar
          </button>
          <button type="button" className={ghostButtonClass} disabled>
            Transcrever agora
          </button>
          <button type="button" className={ghostButtonClass} disabled>
            Encerrar
          </button>
        </div>
        <p className="mt-2 text-xs text-lotus-500">
          Controles reservados. A gravação não inicia automaticamente neste release.
        </p>
      </WorkspaceComingSoon>

      {supabase && authorization ? (
        <>
          <div id="exames" className="scroll-mt-16">
            <ClinicalExamsPanel
              supabase={supabase}
              organizationId={encounter.organizationId}
              practiceId={encounter.practiceId}
              patientId={encounter.patientId}
              encounterId={encounter.id}
              canAnalyze={viewerIsEncounterProfessional(authorization, encounter)}
              canAttach={
                viewerIsEncounterProfessional(authorization, encounter) ||
                hasStaffRole(authorization, "secretary")
              }
              attachSource={
                viewerIsEncounterProfessional(authorization, encounter) ? "secretaria" : "secretaria"
              }
            />
          </div>
          <div id="receita" className="scroll-mt-16">
            <ClinicalPrescriptionPanel
              supabase={supabase}
              organizationId={encounter.organizationId}
              practiceId={encounter.practiceId}
              patientId={encounter.patientId}
              professionalId={encounter.professionalId}
              encounterId={encounter.id}
              canManage={viewerIsEncounterProfessional(authorization, encounter)}
            />
          </div>
          <div id="orientacao" className="scroll-mt-16">
            <ClinicalOrientationsPanel
              supabase={supabase}
              organizationId={encounter.organizationId}
              practiceId={encounter.practiceId}
              patientId={encounter.patientId}
              professionalId={encounter.professionalId}
              encounterId={encounter.id}
              appointmentId={encounter.appointmentId}
              patientName={patientName ?? "Paciente"}
              professionalName={professionalName ?? "Profissional"}
              canManage={viewerIsEncounterProfessional(authorization, encounter)}
            />
          </div>
        </>
      ) : null}

      <WorkspaceComingSoon id="retorno" title="Retorno" stage="C040.7" />

      <section id="encerramento" className="mt-4 scroll-mt-16">
        <div className="card mb-0 overflow-x-hidden">
          <h2 className="text-base font-semibold text-lotus-900">Encerramento</h2>
          <p className="mt-1 text-sm text-lotus-600">
            Salvar evolução, assinar o prontuário e registrar o término efetivo permanecem ações
            distintas.
          </p>
        </div>
        <EncounterActions
          locked={locked}
          busy={busy || linkBusy}
          canEndAttendance={Boolean(
            encounter.appointmentId && viewerIsEncounterProfessional(authorization, encounter),
          )}
          attendanceEnded={attendanceEnded}
          onSave={() => void onSave()}
          onSign={() => void onSign()}
          onEndAttendance={() => void onEndAttendance()}
        />
      </section>
    </div>
  );
}
