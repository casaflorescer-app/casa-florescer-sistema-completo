"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { OrientationRecorder } from "@/components/orientations/OrientationRecorder";
import { buttonClass, ghostButtonClass, StatusMessage } from "@/components/platform/Ui";
import { formatDateTime } from "@/lib/platform/format";
import {
  cancelOrientationDraft,
  createClinicalOrientation,
  createOrientationNewVersion,
  createSignedOrientationAudioUrl,
  linkOrientationExams,
  listLinkedExamIds,
  listOpenFeedbackForPatient,
  listOrientationVersions,
  listOrientationsForEncounter,
  listOrientationsForPatient,
  publishOrientation,
  saveOrientationDraft,
  uploadOrientationAudio,
  type OrientationFeedbackRow,
} from "@/lib/orientations/directory";
import type {
  ClinicalOrientationRow,
  ClinicalOrientationVersionRow,
  DeliveryMode,
} from "@/lib/orientations/types";
import { ORIENTATION_STATUS_LABEL } from "@/lib/orientations/types";
import { listExamOrdersForPatient } from "@/lib/exams/directory";
import type { ExamOrderRow } from "@/lib/exams/types";

export function ClinicalOrientationsPanel({
  supabase,
  organizationId,
  practiceId,
  patientId,
  professionalId,
  encounterId,
  appointmentId,
  patientName,
  professionalName,
  canManage,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  practiceId: string;
  patientId: string;
  professionalId: string;
  encounterId?: string | null;
  appointmentId?: string | null;
  patientName: string;
  professionalName: string;
  canManage: boolean;
}) {
  const [orientations, setOrientations] = useState<ClinicalOrientationRow[]>([]);
  const [versions, setVersions] = useState<ClinicalOrientationVersionRow[]>([]);
  const [activeOrientationId, setActiveOrientationId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ClinicalOrientationVersionRow | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [exams, setExams] = useState<ExamOrderRow[]>([]);
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>([]);
  const [openFeedback, setOpenFeedback] = useState<OrientationFeedbackRow[]>([]);

  const reload = useCallback(async () => {
    const [rows, examRows, feedback] = await Promise.all([
      encounterId
        ? listOrientationsForEncounter(supabase, encounterId)
        : listOrientationsForPatient(supabase, patientId),
      listExamOrdersForPatient(supabase, patientId),
      listOpenFeedbackForPatient(supabase, patientId),
    ]);
    setOrientations(rows);
    setExams(examRows);
    setOpenFeedback(feedback);
    if (activeOrientationId) {
      const list = await listOrientationVersions(supabase, activeOrientationId);
      setVersions(list);
      setDraft(list.find((item) => item.status === "draft") ?? null);
      setSelectedExamIds(await listLinkedExamIds(supabase, activeOrientationId));
    }
  }, [activeOrientationId, encounterId, patientId, supabase]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!draft?.audioStoragePath) {
        setAudioUrl(null);
        return;
      }
      const url = await createSignedOrientationAudioUrl(supabase, draft.audioStoragePath);
      if (!cancelled) setAudioUrl(url);
    })();
    return () => {
      cancelled = true;
    };
  }, [draft?.audioStoragePath, supabase]);

  async function openOrientation(orientationId: string) {
    setActiveOrientationId(orientationId);
    setComposerOpen(true);
    const list = await listOrientationVersions(supabase, orientationId);
    setVersions(list);
    setDraft(list.find((item) => item.status === "draft") ?? null);
    setSelectedExamIds(await listLinkedExamIds(supabase, orientationId));
  }

  async function persistExamLinks(orientationId: string) {
    const result = await linkOrientationExams(supabase, orientationId, selectedExamIds);
    if (result.error) setError(result.error);
  }

  async function onCreate() {
    if (!canManage) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await createClinicalOrientation(supabase, {
        organizationId,
        practiceId,
        patientId,
        professionalId,
        encounterId,
        appointmentId,
        title: "Orientação clínica",
      });
      if (result.error || !result.orientation || !result.version) {
        setError(result.error ?? "Não foi possível criar a orientação.");
        return;
      }
      setActiveOrientationId(result.orientation.id);
      setDraft(result.version);
      setComposerOpen(true);
      if (selectedExamIds.length > 0) {
        await linkOrientationExams(supabase, result.orientation.id, selectedExamIds);
      }
      setNotice("Rascunho criado.");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function onNewVersion() {
    if (!activeOrientationId || !canManage) return;
    setBusy(true);
    setError(null);
    try {
      const result = await createOrientationNewVersion(supabase, activeOrientationId);
      if (result.error || !result.version) {
        setError(result.error ?? "Não foi possível criar nova versão.");
        return;
      }
      setDraft(result.version);
      setNotice("Nova versão em rascunho.");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function onCancelDraft() {
    if (!draft || !canManage) return;
    const confirmed = window.confirm(
      "Cancelar este rascunho? A paciente não verá esta orientação. Versões já publicadas não serão alteradas.",
    );
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      const result = await cancelOrientationDraft(supabase, draft.id);
      if (result.error || !result.version) {
        setError(result.error ?? "Não foi possível cancelar o rascunho.");
        return;
      }
      setDraft(null);
      setAudioUrl(null);
      setNotice("Rascunho cancelado. Nada foi publicado à paciente.");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function onAudioReady(blob: Blob, mimeType: string, durationSeconds: number) {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const upload = await uploadOrientationAudio(supabase, {
        organizationId,
        patientId,
        orientationId: draft.orientationId,
        versionId: draft.id,
        blob,
        mimeType,
        durationSeconds,
      });
      if (upload.error) {
        setError(upload.error);
        return;
      }
      setNotice("Áudio original salvo.");
      await reload();
      const list = await listOrientationVersions(supabase, draft.orientationId);
      setDraft(list.find((item) => item.id === draft.id) ?? null);
    } finally {
      setBusy(false);
    }
  }

  async function onTranscribe() {
    if (!draft?.audioStoragePath) {
      setError("Grave e salve o áudio antes de transcrever.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/orientations/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: draft.id,
          audioStoragePath: draft.audioStoragePath,
        }),
      });
      const json = (await response.json()) as {
        error?: string;
        text?: string;
        status?: string;
        version?: ClinicalOrientationVersionRow;
      };
      if (json.status === "unavailable") {
        if (json.version) setDraft(json.version);
        setNotice("Transcrição automática ainda não disponível. Escreva a orientação.");
        await reload();
        return;
      }
      if (!response.ok) {
        setError(json.error ?? "Transcrição falhou. Você pode digitar a orientação.");
        await reload();
        return;
      }
      if (json.version) setDraft(json.version);
      setNotice("Transcrição concluída. Revise antes de publicar.");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function onSaveDraft(patch: {
    finalText?: string;
    deliveryMode?: DeliveryMode | null;
    reviewedConfirmed?: boolean;
  }) {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const result = await saveOrientationDraft(supabase, {
        version_id: draft.id,
        final_text: patch.finalText ?? draft.finalText,
        delivery_mode: patch.deliveryMode ?? draft.deliveryMode,
        reviewed_confirmed: patch.reviewedConfirmed ?? draft.reviewedConfirmed,
      });
      if (result.error || !result.version) {
        setError(result.error ?? "Não foi possível salvar.");
        return;
      }
      setDraft(result.version);
      setNotice("Rascunho salvo.");
    } finally {
      setBusy(false);
    }
  }

  async function onPublish() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      await persistExamLinks(draft.orientationId);
      const saved = await saveOrientationDraft(supabase, {
        version_id: draft.id,
        final_text: draft.finalText ?? "",
        delivery_mode: draft.deliveryMode,
        reviewed_confirmed: draft.reviewedConfirmed,
      });
      if (saved.error || !saved.version) {
        setError(saved.error ?? "Não foi possível salvar antes de publicar.");
        return;
      }
      const result = await publishOrientation(supabase, saved.version.id);
      if (result.error || !result.version) {
        setError(result.error ?? "Não foi possível publicar.");
        return;
      }
      setDraft(null);
      setNotice("Orientação publicada para a paciente.");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-lotus-900">Orientações à paciente</h2>
          <p className="mt-1 text-sm text-lotus-600">
            Grave, revise a transcrição e publique texto ou texto + áudio. Não altera o SOAP.
          </p>
        </div>
        {canManage ? (
          <button type="button" className={buttonClass} disabled={busy} onClick={() => void onCreate()}>
            Nova orientação
          </button>
        ) : null}
      </div>

      <StatusMessage error={error} notice={notice} />

      {openFeedback.length > 0 ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-3 text-sm">
          <p className="font-semibold text-lotus-900">Solicitações da paciente</p>
          <ul className="mt-2 space-y-1 text-lotus-700">
            {openFeedback.map((item) => (
              <li key={item.id}>
                {formatDateTime(item.createdAt)} ·{" "}
                {item.message || "Solicitação de nova orientação / esclarecimento"}
                <button
                  type="button"
                  className={`${ghostButtonClass} ml-2`}
                  onClick={() => void openOrientation(item.orientationId)}
                >
                  Abrir orientação
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ul className="mt-4 space-y-2">
        {orientations.length === 0 ? (
          <li className="text-sm text-lotus-600">Nenhuma orientação publicada ou em rascunho.</li>
        ) : (
          orientations.map((item) => (
            <li key={item.id} className="rounded-md border border-lotus-100 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-lotus-900">{item.title}</p>
                  <p className="text-lotus-600">
                    {professionalName} · {formatDateTime(item.updatedAt)}
                  </p>
                </div>
                <button
                  type="button"
                  className={ghostButtonClass}
                  onClick={() => void openOrientation(item.id)}
                >
                  Ver orientação
                </button>
              </div>
            </li>
          ))
        )}
      </ul>

      {composerOpen && activeOrientationId ? (
        <div className="mt-5 border-t border-lotus-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-lotus-900">
              Orientação clínica · {patientName}
            </h3>
            <div className="flex flex-wrap gap-2">
              {canManage && !draft ? (
                <button
                  type="button"
                  className={ghostButtonClass}
                  disabled={busy}
                  onClick={() => void onNewVersion()}
                >
                  Nova versão
                </button>
              ) : null}
              <button
                type="button"
                className={ghostButtonClass}
                onClick={() => {
                  setComposerOpen(false);
                  setDraft(null);
                }}
              >
                Fechar
              </button>
            </div>
          </div>

          {versions.length > 0 ? (
            <ul className="mt-3 space-y-1 text-xs text-lotus-600">
              {versions.map((item) => (
                <li key={item.id}>
                  V{item.version} · {ORIENTATION_STATUS_LABEL[item.status]}
                  {item.publishedAt ? ` · publicada ${formatDateTime(item.publishedAt)}` : null}
                  {item.viewedAt ? ` · visualizada ${formatDateTime(item.viewedAt)}` : null}
                  {item.audioPlayedAt ? ` · áudio ${formatDateTime(item.audioPlayedAt)}` : null}
                </li>
              ))}
            </ul>
          ) : null}

          {draft && canManage ? (
            <div className="mt-4 space-y-4">
              {exams.length > 0 ? (
                <fieldset className="space-y-2 text-sm">
                  <legend className="font-semibold text-lotus-800">Exames relacionados</legend>
                  {exams.map((exam) => {
                    const checked = selectedExamIds.includes(exam.id);
                    return (
                      <label key={exam.id} className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={checked}
                          disabled={busy}
                          onChange={(event) => {
                            setSelectedExamIds((current) =>
                              event.target.checked
                                ? [...current, exam.id]
                                : current.filter((id) => id !== exam.id),
                            );
                          }}
                        />
                        <span>
                          {exam.title}
                          {exam.documentDate ? ` · ${exam.documentDate}` : ""}
                        </span>
                      </label>
                    );
                  })}
                  <button
                    type="button"
                    className={ghostButtonClass}
                    disabled={busy}
                    onClick={() => void persistExamLinks(draft.orientationId)}
                  >
                    Salvar vínculo com exames
                  </button>
                </fieldset>
              ) : null}

              <OrientationRecorder disabled={busy} onReady={(blob, mime, duration) => void onAudioReady(blob, mime, duration)} />

              {draft.audioStoragePath ? (
                <div className="space-y-2">
                  {audioUrl ? <audio controls src={audioUrl} className="w-full max-w-md" /> : null}
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busy}
                    onClick={() => void onTranscribe()}
                  >
                    Transcrever áudio
                  </button>
                  {draft.transcriptionStatus === "unavailable" ||
                  draft.transcriptionStatus === "not_requested" ? (
                    <p className="text-sm text-lotus-600">
                      Transcrição automática ainda não disponível. Você pode escrever a orientação.
                    </p>
                  ) : null}
                  {draft.transcriptionStatus === "failed" ? (
                    <p className="text-sm text-amber-800">
                      {draft.transcriptionError || "Transcrição falhou. Digite a orientação."}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {draft.transcriptionText ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-lotus-500">
                    Transcrição automática
                  </p>
                  <p className="mt-1 whitespace-pre-wrap rounded-md border border-lotus-100 bg-white p-3 text-sm text-lotus-800">
                    {draft.transcriptionText}
                  </p>
                  <p className="mt-2 text-xs text-amber-800">
                    Revise a transcrição antes de publicar. A transcrição automática pode conter erros.
                  </p>
                </div>
              ) : null}

              <label className="block text-sm">
                <span className="font-semibold text-lotus-800">Orientação final para a paciente</span>
                <textarea
                  className="mt-1 w-full rounded-md border border-lotus-200 px-3 py-2"
                  rows={6}
                  value={draft.finalText ?? ""}
                  disabled={busy}
                  onChange={(event) =>
                    setDraft({ ...draft, finalText: event.target.value, reviewedConfirmed: false })
                  }
                />
              </label>

              <fieldset className="space-y-2 text-sm">
                <legend className="font-semibold text-lotus-800">Forma de envio</legend>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="delivery"
                    checked={draft.deliveryMode === "TEXT_ONLY"}
                    disabled={busy}
                    onChange={() =>
                      setDraft({ ...draft, deliveryMode: "TEXT_ONLY", reviewedConfirmed: false })
                    }
                  />
                  Somente texto
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="delivery"
                    checked={draft.deliveryMode === "AUDIO_ONLY"}
                    disabled={busy || !draft.audioStoragePath}
                    onChange={() =>
                      setDraft({ ...draft, deliveryMode: "AUDIO_ONLY", reviewedConfirmed: false })
                    }
                  />
                  Somente áudio
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="delivery"
                    checked={draft.deliveryMode === "TEXT_AND_AUDIO"}
                    disabled={busy || !draft.audioStoragePath}
                    onChange={() =>
                      setDraft({
                        ...draft,
                        deliveryMode: "TEXT_AND_AUDIO",
                        reviewedConfirmed: false,
                      })
                    }
                  />
                  Texto + áudio
                </label>
              </fieldset>

              <label className="flex items-start gap-2 text-sm text-lotus-800">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={draft.reviewedConfirmed}
                  disabled={busy}
                  onChange={(event) =>
                    setDraft({ ...draft, reviewedConfirmed: event.target.checked })
                  }
                />
                Revisei a orientação e confirmei seu conteúdo.
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={ghostButtonClass}
                  disabled={busy}
                  onClick={() =>
                    void onSaveDraft({
                      finalText: draft.finalText ?? "",
                      deliveryMode: draft.deliveryMode,
                      reviewedConfirmed: draft.reviewedConfirmed,
                    })
                  }
                >
                  Salvar rascunho
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={busy || !draft.reviewedConfirmed}
                  onClick={() => void onPublish()}
                >
                  Publicar orientação
                </button>
                <button
                  type="button"
                  className={ghostButtonClass}
                  disabled={busy}
                  onClick={() => void onCancelDraft()}
                >
                  Cancelar rascunho
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
