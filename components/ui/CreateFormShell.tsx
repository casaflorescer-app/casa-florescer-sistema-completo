"use client";

import { useEffect, useId, type ReactNode } from "react";
import { X } from "lucide-react";
import { buttonVariantClass } from "@/components/ui/buttonStyles";

const SIZE_CLASS = {
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
} as const;

/**
 * Shell modal para cadastro/edição sob demanda.
 * A listagem permanece limpa; o formulário só monta quando `open`.
 * C070-C9
 */
export function CreateFormShell({
  open,
  title,
  description,
  size = "md",
  busy = false,
  onClose,
  children,
  formId,
}: {
  open: boolean;
  title: string;
  description?: string;
  size?: keyof typeof SIZE_CLASS;
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
  /** id opcional no painel (ex.: testes); só existe no DOM enquanto aberto */
  formId?: string;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [busy, onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-lotus-900/40 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        id={formId}
        data-create-form-shell="true"
        className={`flex max-h-[min(92vh,880px)] w-full flex-col overflow-hidden rounded-2xl border border-lotus-100 bg-white shadow-lg ${SIZE_CLASS[size]}`}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-lotus-100 px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-lotus-900">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm text-lotus-600">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            className={`${buttonVariantClass.ghost} !px-2`}
            aria-label="Fechar"
            disabled={busy}
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">{children}</div>
      </div>
    </div>
  );
}
