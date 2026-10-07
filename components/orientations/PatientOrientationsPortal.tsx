"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { StatusMessage, buttonClass, ghostButtonClass } from "@/components/platform/Ui";
import { formatDateTime } from "@/lib/platform/format";
import {
  createSignedOrientationAudioUrl,
  dismissPatientNotification,
  listPatientNotifications,
  listPublishedOrientationsForPatient,
  markOrientationAudioPlayed,
  markOrientationViewed,
  submitOrientationFeedback,
} from "@/lib/orientations/directory";
import type { ClinicalOrientationRow, ClinicalOrientationVersionRow, PatientNotificationRow } from "@/lib/orientations/types";
import { listExamOrdersForPatient, submitExamWithFile } from "@/lib/exams/directory";
import { EXAM_CLINICAL_STATUS_LABEL, type ExamOrderRow } from "@/lib/exams/types";
import {
  listPrescriptionItems,
  listPrescriptionsForPatient,
  markPrescriptionViewed,
  type PrescriptionItemRow,
  type PrescriptionRow,
} from "@/lib/prescriptions/directory";

export function PatientOrientationsPortal({ embedded = false }: { embedded?: boolean }) {
  const { authorization, authorizationLoading } = useAuth();
  const [items, setItems] = useState<
    Array<{ orientation: ClinicalOrientationRow; version: ClinicalOrientationVersionRow }>
  >([]);
  const [exams, setExams] = useState<ExamOrderRow[]>([]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionRow[]>([]);
  const [rxItems, setRxItems] = useState<PrescriptionItemRow[]>([]);
  const [notifications, setNotifications] = useState<PatientNotificationRow[]>([]);
  const [selected, setSelected] = useState<{
    orientation: ClinicalOrientationRow;
    version: ClinicalOrientationVersionRow;
  } | null>(null);
  const [selectedRx, setSelectedRx] = useState<PrescriptionRow | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [examTitle, setExamTitle] = useState("");
  const [examFile, setExamFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const supabase = createClient();
  const patientId = authorization?.patientAccount?.patientId ?? null;
  const organizationId = authorization?.patientAccount?.organizationId ?? null;
  const practiceId =
    authorization?.memberships?.[0]?.practiceId ??
    // fallback: house practice from published orientation / exam later
    null;

  useEffect(() => {
    if (authorizationLoading) return;
    if (!supabase || !patientId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const [published, notifs, examRows, rxRows] = await Promise.all([
        listPublishedOrientationsForPatient(supabase, patientId),
        listPatientNotifications(supabase),
        listExamOrdersForPatient(supabase, patientId),
        listPrescriptionsForPatient(supabase, patientId),
      ]);
      if (cancelled) return;
      setItems(published);
      setExams(examRows);
      setPrescriptions(rxRows.filter((row) => row.status === "signed" || row.status === "dispatched"));
      setNotifications(
        notifs.filter((item) =>
          ["clinical_orientation_published", "prescription_published"].includes(item.eventType),
        ),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authorizationLoading, patientId, supabase]);

  async function openItem(item: {
    orientation: ClinicalOrientationRow;
    version: ClinicalOrientationVersionRow;
  }) {
    if (!supabase) return;
    setSelected(item);
    setSelectedRx(null);
    setError(null);
    await markOrientationViewed(supabase, item.version.id);
    if (
      (item.version.deliveryMode === "TEXT_AND_AUDIO" || item.version.deliveryMode === "AUDIO_ONLY") &&
      item.version.audioStoragePath
    ) {
      setAudioUrl(await createSignedOrientationAudioUrl(supabase, item.version.audioStoragePath));
    } else {
      setAudioUrl(null);
    }
  }

  async function onFeedback(
    kind: "understood" | "clarification_request",
    message?: string,
  ) {
    if (!supabase || !selected) return;
    setBusy(true);
    setError(null);
    try {
      const result = await submitOrientationFeedback(supabase, {
        orientationId: selected.orientation.id,
        orientationVersionId: selected.version.id,
        kind,
        message:
          message ??
          (kind === "clarification_request" ? "Solicito nova orientação." : undefined),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setNotice(
        kind === "understood"
          ? "Obrigado. Registramos que você entendeu a orientação."
          : "Sua solicitação foi enviada à equipe médica.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onSendExam() {
    if (!supabase || !patientId || !organizationId || !examFile || !examTitle.trim()) {
      setError("Informe o tipo do exame e selecione o arquivo.");
      return;
    }
    const resolvedPractice =
      practiceId ||
      exams[0]?.practiceId ||
      items[0]?.orientation.practiceId ||
      null;
    if (!resolvedPractice) {
      setError("Não foi possível identificar a clínica. Contate a secretaria.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await submitExamWithFile(supabase, {
        organizationId,
        practiceId: resolvedPractice,
        patientId,
        title: examTitle.trim(),
        source: "paciente",
        file: examFile,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setExamTitle("");
      setExamFile(null);
      setNotice("Exame enviado. A médica será avisada.");
      setExams(await listExamOrdersForPatient(supabase, patientId));
    } finally {
      setBusy(false);
    }
  }

  if (authorizationLoading || loading) {
    return <p className="text-sm text-lotus-600">Carregando seu portal…</p>;
  }

  if (!patientId) {
    return <StatusMessage error="Área disponível somente para paciente autenticada." />;
  }

  return (
    <div>
      {embedded ? (
        <>
          <h2 className="text-base font-semibold text-lotus-900">Meus documentos</h2>
          <p className="mt-1 text-sm text-lotus-700">
            Exames, orientações e receitas disponibilizadas pela sua médica.
          </p>
        </>
      ) : (
        <>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">Paciente</p>
          <h1 className="page-title mt-1">Minha saúde</h1>
          <p className="page-sub mt-2">Exames, orientações e receitas disponibilizadas pela sua médica.</p>
        </>
      )}

      <StatusMessage error={error} notice={notice} />

      {!embedded && notifications.length > 0 ? (
        <section className="mt-4 rounded-md border border-lotus-200 bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-lotus-500">
            Atualização no seu atendimento
          </p>
          <p className="mt-1 text-sm text-lotus-800">{notifications[0].message}</p>
          <button
            type="button"
            className={`${ghostButtonClass} mt-2`}
            onClick={() => {
              if (!supabase) return;
              void dismissPatientNotification(supabase, notifications[0].id).then(() => {
                setNotifications((current) => current.filter((item) => item.id !== notifications[0].id));
              });
            }}
          >
            Dispensar
          </button>
        </section>
      ) : null}

      <section className="card mt-6">
        <h2 className="text-base font-semibold text-lotus-900">Enviar exame</h2>
        <div className="mt-3 space-y-2">
          <input
            className="w-full rounded-md border border-lotus-200 px-3 py-2 text-sm"
            placeholder="Tipo do exame"
            value={examTitle}
            onChange={(event) => setExamTitle(event.target.value)}
          />
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={(event) => setExamFile(event.target.files?.[0] ?? null)}
          />
          <button type="button" className={buttonClass} disabled={busy} onClick={() => void onSendExam()}>
            Enviar exame
          </button>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-base font-semibold text-lotus-900">Seus exames</h2>
        <ul className="mt-3 space-y-2">
          {exams.length === 0 ? (
            <li className="text-sm text-lotus-600">Nenhum exame enviado.</li>
          ) : (
            exams.map((exam) => (
              <li key={exam.id} className="rounded-md border border-lotus-100 px-4 py-3 text-sm">
                <p className="font-semibold text-lotus-900">{exam.title}</p>
                <p className="text-lotus-600">
                  {exam.documentDate || (exam.receivedAt ? formatDateTime(exam.receivedAt) : "—")}
                  {" · "}
                  {EXAM_CLINICAL_STATUS_LABEL[exam.clinicalStatus]}
                </p>
                {exam.clinicalStatus === "ORIENTACAO_PUBLICADA" ||
                exam.clinicalStatus === "ANALISADO" ||
                exam.clinicalStatus === "ORIENTACAO_PENDENTE" ? (
                  <p className="mt-1 text-lotus-800">
                    ✓ Exame analisado pela médica
                    {exam.analyzedAt ? ` · ${formatDateTime(exam.analyzedAt)}` : ""}
                  </p>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="text-base font-semibold text-lotus-900">Minhas orientações</h2>
        <ul className="mt-3 space-y-3">
          {items.length === 0 ? (
            <li className="text-sm text-lotus-600">Você ainda não possui orientações publicadas.</li>
          ) : (
            items.map((item) => (
              <li key={item.orientation.id} className="rounded-md border border-lotus-100 px-4 py-3">
                <p className="text-sm font-semibold text-lotus-900">{item.orientation.title}</p>
                <p className="text-sm text-lotus-600">
                  {item.version.publishedAt ? formatDateTime(item.version.publishedAt) : "—"}
                  {" · "}✓ Exames analisados
                </p>
                <button type="button" className={`${buttonClass} mt-2`} onClick={() => void openItem(item)}>
                  Ver orientação
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="text-base font-semibold text-lotus-900">Minhas receitas</h2>
        <ul className="mt-3 space-y-2">
          {prescriptions.length === 0 ? (
            <li className="text-sm text-lotus-600">Nenhuma receita disponível.</li>
          ) : (
            prescriptions.map((rx) => (
              <li key={rx.id} className="rounded-md border border-lotus-100 px-4 py-3 text-sm">
                <p className="font-semibold text-lotus-900">
                  Receita · {formatDateTime(rx.publishedToPatientAt || rx.signedAt || rx.createdAt)}
                </p>
                <button
                  type="button"
                  className={`${buttonClass} mt-2`}
                  onClick={() => {
                    if (!supabase) return;
                    setSelected(null);
                    setSelectedRx(rx);
                    void markPrescriptionViewed(supabase, rx.id);
                    void listPrescriptionItems(supabase, rx.id).then(setRxItems);
                  }}
                >
                  Ver receita
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      {selected ? (
        <section className="card mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-lotus-900">{selected.orientation.title}</h2>
            <button type="button" className={ghostButtonClass} onClick={() => setSelected(null)}>
              Fechar
            </button>
          </div>
          <p className="mt-1 text-sm text-lotus-600">
            {selected.version.publishedAt ? formatDateTime(selected.version.publishedAt) : "—"}
          </p>
          {selected.version.deliveryMode !== "AUDIO_ONLY" && selected.version.finalText ? (
            <p className="mt-4 whitespace-pre-wrap text-sm text-lotus-900">{selected.version.finalText}</p>
          ) : null}
          {(selected.version.deliveryMode === "TEXT_AND_AUDIO" ||
            selected.version.deliveryMode === "AUDIO_ONLY") &&
          audioUrl ? (
            <div className="mt-4">
              <p className="text-sm font-semibold text-lotus-800">Ouvir orientação</p>
              <audio
                className="mt-2 w-full max-w-md"
                controls
                src={audioUrl}
                onPlay={() => {
                  if (!supabase) return;
                  void markOrientationAudioPlayed(supabase, selected.version.id);
                }}
              />
            </div>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className={buttonClass} disabled={busy} onClick={() => void onFeedback("understood")}>
              Entendi a orientação
            </button>
            <button
              type="button"
              className={ghostButtonClass}
              disabled={busy}
              onClick={() => void onFeedback("clarification_request", "Tenho uma dúvida sobre a orientação.")}
            >
              Tenho uma dúvida
            </button>
            <button
              type="button"
              className={ghostButtonClass}
              disabled={busy}
              onClick={() => void onFeedback("clarification_request", "Solicito nova orientação.")}
            >
              Solicitar nova orientação
            </button>
          </div>
        </section>
      ) : null}

      {selectedRx ? (
        <section className="card mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-lotus-900">Receita</h2>
            <button type="button" className={ghostButtonClass} onClick={() => setSelectedRx(null)}>
              Fechar
            </button>
          </div>
          <ul className="mt-3 space-y-2 text-sm text-lotus-800">
            {rxItems.map((item) => (
              <li key={item.id}>
                <strong>{item.medicationName}</strong>
                {item.dosage ? ` · ${item.dosage}` : ""}
                {item.frequency ? ` · ${item.frequency}` : ""}
                {item.duration ? ` · ${item.duration}` : ""}
                {item.instructions ? ` — ${item.instructions}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
