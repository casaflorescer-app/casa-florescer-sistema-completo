"use client";

import { useEffect, useId } from "react";
import { buttonVariantClass } from "@/components/ui/buttonStyles";

/**
 * Confirmação amigável (substitui window.confirm nas telas de maior uso).
 * C070-C4.3
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-lotus-900/40 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-2xl border border-lotus-100 bg-white p-4 shadow-lg sm:p-5"
        data-confirm-dialog="true"
      >
        <h2 id={titleId} className="text-base font-semibold text-lotus-900">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 whitespace-pre-line text-sm text-lotus-700">{description}</p>
        ) : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className={buttonVariantClass.ghost}
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? buttonVariantClass.danger : buttonVariantClass.primary}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Aguarde…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
