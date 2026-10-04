"use client";

import { useEffect, useRef, useState } from "react";
import { buttonClass, ghostButtonClass } from "@/components/platform/Ui";

type Phase = "idle" | "recording" | "paused" | "recorded";

export function OrientationRecorder({
  disabled,
  onReady,
}: {
  disabled?: boolean;
  onReady: (blob: Blob, mimeType: string, durationSeconds: number) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const pausedAccumRef = useRef<number>(0);
  const pauseStartedRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const mimeRef = useRef("audio/webm");

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      mediaRef.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, [previewUrl]);

  async function start() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Gravação de áudio não disponível neste navegador.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: mimeRef.current });
        blobRef.current = blob;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(URL.createObjectURL(blob));
        setPhase("recorded");
      };
      mediaRef.current = recorder;
      startedAtRef.current = Date.now();
      pausedAccumRef.current = 0;
      setSeconds(0);
      timerRef.current = window.setInterval(() => {
        const base = Date.now() - startedAtRef.current - pausedAccumRef.current;
        setSeconds(Math.floor(base / 1000));
      }, 250);
      recorder.start();
      setPhase("recording");
    } catch {
      setError("Permissão de microfone negada ou microfone indisponível.");
    }
  }

  function pause() {
    const recorder = mediaRef.current;
    if (!recorder || recorder.state !== "recording") return;
    if (typeof recorder.pause === "function") {
      recorder.pause();
      pauseStartedRef.current = Date.now();
      setPhase("paused");
    }
  }

  function resume() {
    const recorder = mediaRef.current;
    if (!recorder || recorder.state !== "paused") return;
    if (typeof recorder.resume === "function") {
      pausedAccumRef.current += Date.now() - pauseStartedRef.current;
      recorder.resume();
      setPhase("recording");
    }
  }

  function stop() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (phase === "paused") {
      pausedAccumRef.current += Date.now() - pauseStartedRef.current;
    }
    mediaRef.current?.stop();
  }

  function discard() {
    blobRef.current = null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSeconds(0);
    setPhase("idle");
  }

  function useRecording() {
    if (!blobRef.current) return;
    onReady(blobRef.current, mimeRef.current, seconds);
  }

  const clock = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="rounded-md border border-lotus-200 bg-lotus-50/50 p-3">
      <p className="text-sm font-semibold text-lotus-900">Áudio original</p>
      {phase === "idle" ? (
        <button type="button" className={`${buttonClass} mt-2`} disabled={disabled} onClick={() => void start()}>
          Gravar orientação
        </button>
      ) : null}
      {phase === "recording" || phase === "paused" ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="text-sm font-semibold text-red-700">
            {phase === "paused" ? "Pausado" : "Gravando"} {clock}
          </p>
          {phase === "recording" ? (
            <button type="button" className={ghostButtonClass} onClick={pause}>
              Pausar
            </button>
          ) : (
            <button type="button" className={ghostButtonClass} onClick={resume}>
              Continuar
            </button>
          )}
          <button type="button" className={buttonClass} onClick={stop}>
            Finalizar
          </button>
        </div>
      ) : null}
      {phase === "recorded" ? (
        <div className="mt-2 space-y-2">
          {previewUrl ? <audio controls src={previewUrl} className="w-full max-w-md" /> : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonClass} disabled={disabled} onClick={useRecording}>
              Usar gravação
            </button>
            <button type="button" className={ghostButtonClass} disabled={disabled} onClick={() => void start()}>
              Regravar
            </button>
            <button type="button" className={ghostButtonClass} disabled={disabled} onClick={discard}>
              Descartar
            </button>
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
