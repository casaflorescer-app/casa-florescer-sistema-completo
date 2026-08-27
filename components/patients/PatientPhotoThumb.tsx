"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getPatientPhotoUrl } from "@/lib/patients/directory";

function PhotoPlaceholder() {
  return (
    <span
      className="inline-flex h-12 w-12 shrink-0 rounded-2xl border border-lotus-100 bg-lotus-50"
      aria-hidden="true"
    />
  );
}

function PatientPhotoLightbox({
  url,
  patientName,
  onClose,
}: {
  url: string;
  patientName: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previousFocus.current?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-lotus-900/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Fotografia de ${patientName}`}
        className="relative max-h-full max-w-full"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          ref={closeRef}
          type="button"
          className="absolute right-0 top-0 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white text-2xl leading-none text-lotus-800 shadow-sm hover:bg-lotus-50"
          aria-label="Fechar fotografia"
          onClick={onClose}
        >
          ×
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={`Fotografia de ${patientName}`}
          className="max-h-[min(90vh,calc(100vh-2rem))] max-w-[min(100vw-2rem,100%)] rounded-2xl object-contain"
        />
      </div>
    </div>
  );
}

export function PatientPhotoThumb({
  photoPath,
  patientName,
}: {
  photoPath: string | null;
  patientName: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"empty" | "loading" | "ready" | "error">(photoPath ? "loading" : "empty");
  const [open, setOpen] = useState(false);
  const closeLightbox = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!photoPath) {
      setUrl(null);
      setStatus("empty");
      return;
    }
    const supabase = createClient();
    if (!supabase) {
      setStatus("error");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    void getPatientPhotoUrl(supabase, photoPath)
      .then((signed) => {
        if (cancelled) return;
        if (!signed) {
          setUrl(null);
          setStatus("error");
          return;
        }
        setUrl(signed);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        console.error("[patients] list photo url failed", err);
        if (cancelled) return;
        setUrl(null);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [photoPath]);

  if (status !== "ready" || !url) {
    return <PhotoPlaceholder />;
  }

  return (
    <>
      <button
        type="button"
        className="inline-flex shrink-0 rounded-2xl focus:outline-none focus:ring-2 focus:ring-lotus-200"
        aria-label={`Ver fotografia de ${patientName}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={`Fotografia de ${patientName}`}
          className="h-12 w-12 rounded-2xl border border-lotus-100 object-cover"
          onError={() => {
            console.error("[patients] list photo image failed");
            setUrl(null);
            setStatus("error");
            setOpen(false);
          }}
        />
      </button>
      {open ? (
        <PatientPhotoLightbox url={url} patientName={patientName} onClose={closeLightbox} />
      ) : null}
    </>
  );
}
