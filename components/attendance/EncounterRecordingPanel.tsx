"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  confirmRecordingShare,
  createSignedRecordingAudioUrl,
  formatDuration,
  listEncounterRecordings,
  markRecordingViewed,
  prepareRecordingShare,
  registerRecordingSegment,
  requestSegmentTranscription,
  reviewTranscription,
  setRecordingSessionStatus,
  startRecordingSession,
  uploadRecordingSegmentAudio,
} from "@/lib/attendance/recording-directory";
import type {
  RecordingBundle,
  RecordingSegmentRow,
  RecordingSessionRow,
  RecordingTranscriptionRow,
} from "@/lib/attendance/recording-types";
import { buttonClass, ghostButtonClass } from "@/components/platform/Ui";

const inputClass =
  "mt-1 w-full rounded-xl border border-lotus-200 bg-white px-3 py-2 text-sm text-lotus-950 outline-none focus:border-lotus-400 focus:ring-2 focus:ring-lotus-200";

function latestTranscription(
  transcriptions: RecordingTranscriptionRow[],
  segmentId: string,
): RecordingTranscriptionRow | null {
  const list = transcriptions
    .filter((item) => item.segmentId === segmentId)
    .sort((a, b) => b.version - a.version);
  return list[0] ?? null;
}

export function EncounterRecordingPanel({
  supabase,
  encounterId,
  locked,
  canEdit,
}: {
  supabase: SupabaseClient;
  encounterId: string;
  locked: boolean;
  canEdit: boolean;
}) {
  const [bundle, setBundle] = useState<RecordingBundle>({
    sessions: [],
    segments: [],
    transcriptions: [],
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [livePhase, setLivePhase] = useState<"idle" | "recording" | "paused">("idle");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, string>>({});
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [playingSegment, setPlayingSegment] = useState<RecordingSegmentRow | null>(null);
  const [shareAudio, setShareAudio] = useState(false);
  const [shareTx, setShareTx] = useState(false);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef("audio/webm");
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const pausedAccumRef = useRef(0);
  const pauseStartedRef = useRef(0);
  const cursorStartRef = useRef(0);
  const flushLock = useRef(false);
  const viewedKeysRef = useRef<Set<string>>(new Set());

  const activeSession = useMemo(
    () => bundle.sessions.find((item) => item.id === activeSessionId) ?? null,
    [activeSessionId, bundle.sessions],
  );

  const refresh = useCallback(async () => {
    const result = await listEncounterRecordings(supabase, encounterId);
    if (result.error) {
      setError(result.error);
    } else {
      setBundle(result.bundle);
      const live = result.bundle.sessions.find(
        (item) => item.status === "recording" || item.status === "paused",
      );
      if (live) {
        setActiveSessionId(live.id);
        if (livePhase === "idle") {
          setLivePhase(live.status === "paused" ? "paused" : "recording");
        }
      }
    }
    setLoading(false);
  }, [encounterId, livePhase, supabase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function startTimer() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      const base = Date.now() - startedAtRef.current - pausedAccumRef.current;
      setSeconds(Math.floor(base / 1000));
    }, 250);
  }

  async function flushSegment(reason: "pause" | "transcribe" | "stop"): Promise<RecordingSegmentRow | null> {
    if (flushLock.current) return null;
    flushLock.current = true;
    try {
      const recorder = mediaRef.current;
      if (recorder && recorder.state === "recording") {
        await new Promise<void>((resolve) => {
          const prev = recorder.ondataavailable;
          recorder.ondataavailable = (event) => {
            if (typeof prev === "function") prev.call(recorder, event);
            if (event.data.size > 0) chunksRef.current.push(event.data);
            resolve();
          };
          recorder.requestData();
          window.setTimeout(() => resolve(), 400);
        });
      }

      if (!activeSessionId || chunksRef.current.length === 0) return null;

      const mime = mimeRef.current || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: mime });
      chunksRef.current = [];
      if (blob.size < 32) return null;

      const elapsedMs = Math.max(0, Date.now() - startedAtRef.current - pausedAccumRef.current);
      const cursorStart = cursorStartRef.current;
      const cursorEnd = elapsedMs;
      const durationSeconds = Math.max(0.1, (cursorEnd - cursorStart) / 1000);

      const registered = await registerRecordingSegment(supabase, {
        sessionId: activeSessionId,
        durationSeconds,
        cursorStartMs: cursorStart,
        cursorEndMs: cursorEnd,
        mimeType: mime,
      });
      if (registered.error || !registered.segment) {
        setError(registered.error ?? "Falha ao registrar segmento.");
        return null;
      }

      const uploaded = await uploadRecordingSegmentAudio(supabase, {
        segment: registered.segment,
        blob,
        mimeType: mime,
      });
      if (uploaded.error || !uploaded.segment) {
        setError(uploaded.error ?? "Upload do áudio não confirmado.");
        return null;
      }

      cursorStartRef.current = cursorEnd;
      setNotice(
        reason === "transcribe"
          ? "Segmento salvo para transcrição."
          : reason === "pause"
            ? "Áudio preservado na pausa."
            : "Segmento final salvo.",
      );
      await refresh();
      return uploaded.segment;
    } finally {
      flushLock.current = false;
    }
  }

  async function onStart() {
    if (locked || !canEdit || busy) return;
    setError(null);
    setNotice(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Gravação de áudio não disponível neste navegador.");
      return;
    }
    setBusy(true);
    const started = await startRecordingSession(supabase, encounterId);
    if (started.error || !started.session) {
      setBusy(false);
      setError(started.error ?? "Não foi possível iniciar a gravação.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mimeRef.current = recorder.mimeType || "audio/webm";
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      mediaRef.current = recorder;
      startedAtRef.current = Date.now();
      pausedAccumRef.current = 0;
      cursorStartRef.current = 0;
      setSeconds(0);
      setActiveSessionId(started.session.id);
      setLivePhase("recording");
      startTimer();
      recorder.start(4000);
      await refresh();
    } catch {
      setError("Permissão de microfone negada ou microfone indisponível.");
      await setRecordingSessionStatus(supabase, started.session.id, "completed");
      setActiveSessionId(null);
      setLivePhase("idle");
    }
    setBusy(false);
  }

  async function onPause() {
    const recorder = mediaRef.current;
    if (!recorder || recorder.state !== "recording" || !activeSessionId) return;
    setBusy(true);
    setError(null);
    if (typeof recorder.pause === "function") {
      recorder.pause();
      pauseStartedRef.current = Date.now();
    }
    await flushSegment("pause");
    const result = await setRecordingSessionStatus(supabase, activeSessionId, "paused");
    if (result.error) setError(result.error);
    setLivePhase("paused");
    setBusy(false);
  }

  async function onResume() {
    const recorder = mediaRef.current;
    if (!recorder || !activeSessionId) return;
    setBusy(true);
    setError(null);
    const result = await setRecordingSessionStatus(supabase, activeSessionId, "recording");
    if (result.error) {
      setError(result.error);
      setBusy(false);
      return;
    }
    if (recorder.state === "paused" && typeof recorder.resume === "function") {
      pausedAccumRef.current += Date.now() - pauseStartedRef.current;
      recorder.resume();
    }
    setLivePhase("recording");
    setBusy(false);
  }

  async function onStop() {
    if (!activeSessionId) return;
    if (!window.confirm("Encerrar gravação? O áudio já capturado será preservado.")) return;
    setBusy(true);
    setError(null);
    if (livePhase === "paused") {
      pausedAccumRef.current += Date.now() - pauseStartedRef.current;
    }
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    await flushSegment("stop");
    mediaRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRef.current = null;
    const result = await setRecordingSessionStatus(supabase, activeSessionId, "completed");
    if (result.error) setError(result.error);
    setLivePhase("idle");
    setActiveSessionId(null);
    setNotice("Gravação encerrada.");
    await refresh();
    setBusy(false);
  }

  async function onTranscribeNow() {
    if (!canEdit || locked || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    let segment: RecordingSegmentRow | null = null;
    if (livePhase === "recording") {
      setNotice(
        "Para transcrever agora, o trecho atual é fechado e a gravação fica pausada. Você pode continuar depois — o áudio já capturado permanece.",
      );
      const recorder = mediaRef.current;
      if (recorder && recorder.state === "recording" && typeof recorder.pause === "function") {
        recorder.pause();
        pauseStartedRef.current = Date.now();
      }
      if (activeSessionId) {
        await setRecordingSessionStatus(supabase, activeSessionId, "paused");
      }
      setLivePhase("paused");
      segment = await flushSegment("transcribe");
    } else if (livePhase === "paused") {
      segment = await flushSegment("transcribe");
    }

    if (!segment) {
      const pending = [...bundle.segments]
        .filter((item) => item.status === "uploaded")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      for (const item of pending) {
        const existing = latestTranscription(bundle.transcriptions, item.id);
        if (!existing || existing.status === "failed" || existing.status === "unavailable") {
          segment = item;
          break;
        }
      }
      if (!segment && pending[0]) segment = pending[0];
    }

    if (!segment?.audioStoragePath) {
      setError("Nenhum segmento de áudio disponível para transcrever.");
      setBusy(false);
      return;
    }

    const requested = await requestSegmentTranscription(supabase, segment.id);
    if (requested.error || !requested.transcription) {
      setError(requested.error ?? "Falha ao solicitar transcrição.");
      setBusy(false);
      return;
    }

    if (
      requested.transcription.status === "available" ||
      requested.transcription.status === "reviewed"
    ) {
      setNotice("Transcrição já disponível para este trecho (sem reprocessar).");
      await refresh();
      setBusy(false);
      return;
    }

    setNotice("Transcrição em processamento…");
    const response = await fetch("/api/encounters/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcriptionId: requested.transcription.id,
        segmentId: segment.id,
        audioStoragePath: segment.audioStoragePath,
      }),
    });
    const json = (await response.json()) as {
      status?: string;
      error?: string;
      isSimulation?: boolean;
    };
    if (json.status === "unavailable") {
      setNotice("Transcrição automática indisponível.");
    } else if (!response.ok) {
      setError(json.error ?? "Transcrição falhou.");
    } else {
      setNotice(
        json.isSimulation
          ? "SIMULAÇÃO — transcrição de desenvolvimento (não é IA real)."
          : "Transcrição disponível para revisão.",
      );
    }
    await refresh();
    setBusy(false);
  }

  async function onPlay(segment: RecordingSegmentRow) {
    if (!segment.audioStoragePath) return;
    setError(null);
    const signed = await createSignedRecordingAudioUrl(supabase, segment.audioStoragePath);
    if (signed.error || !signed.url) {
      setError(signed.error ?? "Não foi possível reproduzir.");
      return;
    }
    setPlayingSegment(segment);
    setPlayUrl(signed.url);
  }

  async function onAudioPlaybackStarted() {
    const segment = playingSegment;
    if (!segment) return;
    const key = `${segment.sessionId}:${segment.id}`;
    if (viewedKeysRef.current.has(key)) return;
    viewedKeysRef.current.add(key);
    const result = await markRecordingViewed(supabase, {
      sessionId: segment.sessionId,
      segmentId: segment.id,
    });
    if (result.error) {
      // Não bloquear reprodução; apenas registrar falha de auditoria de forma discreta.
      console.warn("RECORDING_VIEWED:", result.error);
    }
  }

  async function onReview(tx: RecordingTranscriptionRow) {
    const text = (reviewDrafts[tx.id] ?? tx.reviewedText ?? tx.originalText ?? "").trim();
    if (!text) {
      setError("Informe o texto revisado.");
      return;
    }
    setBusy(true);
    const result = await reviewTranscription(supabase, tx.id, text);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setNotice("Revisão salva. O texto original permanece preservado.");
    await refresh();
  }

  async function onShare(session: RecordingSessionRow | null) {
    if (!shareAudio && !shareTx) {
      setError("Selecione áudio e/ou transcrição.");
      return;
    }
    if (!window.confirm("Confirmar preparação de envio à paciente? (sem WhatsApp nesta etapa)")) {
      return;
    }
    setBusy(true);
    const latestTx = [...bundle.transcriptions].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )[0];
    const prepared = await prepareRecordingShare(supabase, {
      encounterId,
      sessionId: session?.id ?? null,
      transcriptionId: shareTx ? latestTx?.id ?? null : null,
      includeAudio: shareAudio,
      includeTranscription: shareTx,
    });
    if (prepared.error || !prepared.shareId) {
      setBusy(false);
      setError(prepared.error ?? "Falha ao preparar compartilhamento.");
      return;
    }
    const confirmed = await confirmRecordingShare(supabase, prepared.shareId, true);
    setBusy(false);
    if (!confirmed.ok) {
      setError(confirmed.error ?? "Falha ao confirmar.");
      return;
    }
    setNotice(
      "Compartilhamento registrado como fila interna (portal). Envio externo ainda não habilitado.",
    );
  }

  const statusLabel =
    livePhase === "recording"
      ? `🔴 Gravando ${formatDuration(seconds)}`
      : livePhase === "paused"
        ? `⏸️ Gravação pausada ${formatDuration(seconds)}`
        : "Pronta para gravar";

  return (
    <section id="gravacao" className="card mt-4 scroll-mt-16 overflow-x-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-lotus-900">Gravação do atendimento</h2>
          <p className="mt-1 text-sm text-lotus-600">
            Opcional. A gravação não inicia sozinha e não substitui o prontuário. A transcrição
            exige revisão da médica antes de qualquer uso clínico.
          </p>
        </div>
        <p className="text-sm font-semibold text-lotus-900">{statusLabel}</p>
      </div>

      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
      {notice ? <p className="mt-3 text-sm text-lotus-700">{notice}</p> : null}

      {locked ? (
        <p className="mt-3 text-sm text-amber-900">
          Encounter finalizado/assinado — nova gravação e edição de transcrição não estão
          disponíveis.
        </p>
      ) : null}

      <div className="mt-4 flex min-w-0 flex-wrap gap-2">
        {livePhase === "idle" ? (
          <button
            type="button"
            className={buttonClass}
            disabled={locked || !canEdit || busy || loading}
            onClick={() => void onStart()}
          >
            Iniciar gravação
          </button>
        ) : null}
        {livePhase === "recording" ? (
          <>
            <button type="button" className={ghostButtonClass} disabled={busy} onClick={() => void onPause()}>
              Pausar
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={busy || locked || !canEdit}
              onClick={() => void onTranscribeNow()}
            >
              Transcrever agora
            </button>
            <button type="button" className={ghostButtonClass} disabled={busy} onClick={() => void onStop()}>
              Encerrar
            </button>
          </>
        ) : null}
        {livePhase === "paused" ? (
          <>
            <p className="w-full text-xs text-lotus-600">
              Gravação pausada. O áudio já capturado está preservado. Use Continuar para retomar ou
              Transcrever para processar o trecho fechado.
            </p>
            <button type="button" className={buttonClass} disabled={busy} onClick={() => void onResume()}>
              Continuar
            </button>
            <button
              type="button"
              className={ghostButtonClass}
              disabled={busy || locked || !canEdit}
              onClick={() => void onTranscribeNow()}
            >
              Transcrever
            </button>
            <button type="button" className={ghostButtonClass} disabled={busy} onClick={() => void onStop()}>
              Encerrar
            </button>
          </>
        ) : null}
        {livePhase === "idle" && bundle.segments.some((item) => item.status === "uploaded") ? (
          <button
            type="button"
            className={ghostButtonClass}
            disabled={busy || locked || !canEdit}
            onClick={() => void onTranscribeNow()}
          >
            Transcrever
          </button>
        ) : null}
      </div>

      {loading ? <p className="mt-4 text-sm text-lotus-600">Carregando gravações…</p> : null}

      {bundle.sessions.length ? (
        <div className="mt-4 space-y-3">
          <h3 className="text-sm font-semibold text-lotus-900">Gravações</h3>
          {bundle.sessions.map((session) => {
            const segs = bundle.segments.filter((item) => item.sessionId === session.id);
            return (
              <div key={session.id} className="rounded-xl border border-lotus-100 bg-lotus-50/60 p-3">
                <p className="text-sm font-medium text-lotus-900">
                  Sessão {session.sequenceNo} · {session.status} ·{" "}
                  {formatDuration(session.totalDurationSeconds || 0)}
                </p>
                <ul className="mt-2 space-y-2 text-sm text-lotus-800">
                  {segs.map((segment) => {
                    const tx = latestTranscription(bundle.transcriptions, segment.id);
                    return (
                      <li key={segment.id} className="rounded-lg bg-white/80 p-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>
                            Segmento {segment.sequenceNo} · {segment.status} ·{" "}
                            {formatDuration(segment.durationSeconds)} · cursor{" "}
                            {segment.cursorStartMs}–{segment.cursorEndMs} ms
                          </span>
                          {segment.status === "uploaded" ? (
                            <button
                              type="button"
                              className={ghostButtonClass}
                              onClick={() => void onPlay(segment)}
                            >
                              Reproduzir
                            </button>
                          ) : null}
                        </div>
                        {tx ? (
                          <div className="mt-2 space-y-2">
                            <p className="text-xs text-lotus-600">
                              Transcrição v{tx.version} · {tx.status}
                              {tx.isSimulation ? " · SIMULAÇÃO" : ""}
                              {tx.provider ? ` · ${tx.provider}` : ""}
                            </p>
                            {tx.status === "unavailable" ? (
                              <p className="text-xs text-amber-900">
                                Transcrição automática indisponível.
                              </p>
                            ) : null}
                            {tx.originalText ? (
                              <div>
                                <p className="text-xs font-semibold text-lotus-500">Original</p>
                                <p className="whitespace-pre-wrap text-sm">{tx.originalText}</p>
                              </div>
                            ) : null}
                            {(tx.status === "available" || tx.status === "reviewed") && canEdit && !locked ? (
                              <div>
                                <label className="text-xs font-semibold text-lotus-500">
                                  Revisada pela médica
                                  <textarea
                                    className={inputClass}
                                    rows={3}
                                    value={
                                      reviewDrafts[tx.id] ??
                                      tx.reviewedText ??
                                      tx.originalText ??
                                      ""
                                    }
                                    onChange={(event) =>
                                      setReviewDrafts((prev) => ({
                                        ...prev,
                                        [tx.id]: event.target.value,
                                      }))
                                    }
                                  />
                                </label>
                                <button
                                  type="button"
                                  className={`${buttonClass} mt-2`}
                                  disabled={busy}
                                  onClick={() => void onReview(tx)}
                                >
                                  Salvar revisão
                                </button>
                              </div>
                            ) : null}
                            {tx.errorMessage ? (
                              <p className="text-xs text-rose-700">{tx.errorMessage}</p>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      ) : null}

      {playUrl ? (
        <div className="mt-4 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">Reprodução</p>
          <audio
            className="mt-2 w-full max-w-full"
            controls
            src={playUrl}
            onPlay={() => void onAudioPlaybackStarted()}
          />
          <p className="mt-1 text-xs text-lotus-500">
            Link temporário assinado (não público). A reprodução efetiva registra auditoria.
          </p>
        </div>
      ) : null}

      {canEdit && !locked && bundle.sessions.some((item) => item.status === "completed") ? (
        <div className="mt-4 rounded-xl border border-lotus-100 p-3">
          <p className="text-sm font-semibold text-lotus-900">Compartilhar com a paciente</p>
          <p className="mt-1 text-xs text-lotus-600">
            Ação explícita. Sem WhatsApp/e-mail nesta etapa — registra fila interna.
          </p>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-lotus-800">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={shareAudio}
                onChange={(event) => setShareAudio(event.target.checked)}
              />
              Áudio
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={shareTx}
                onChange={(event) => setShareTx(event.target.checked)}
              />
              Transcrição
            </label>
          </div>
          <button
            type="button"
            className={`${buttonClass} mt-3`}
            disabled={busy}
            onClick={() =>
              void onShare(
                bundle.sessions.find((item) => item.status === "completed") ?? null,
              )
            }
          >
            Compartilhar
          </button>
        </div>
      ) : null}

      <p className="mt-4 text-xs text-lotus-500">
        Próximas etapas (não nesta entrega): IA clínica, SOAP sugerido, canais externos. C040.4 não
        iniciado.
      </p>
    </section>
  );
}
