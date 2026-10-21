"use client";

import { useEffect, useId, useState } from "react";
import { formatPhone } from "@/lib/patients/format";
import { normalizePhoneForWhatsApp } from "@/lib/whatsapp/phone";
import { openWhatsAppWeb } from "@/lib/whatsapp/url";
import {
  WHATSAPP_FEEDBACK_DOCUMENT,
  WHATSAPP_FEEDBACK_OPENED,
} from "@/lib/whatsapp/messages";
import { buttonClass, fieldClass, ghostButtonClass } from "@/components/platform/Ui";

export function WhatsAppComposeDialog({
  open,
  onClose,
  recipientName,
  phone,
  initialMessage,
  documentHint = false,
  onOpened,
}: {
  open: boolean;
  onClose: () => void;
  recipientName: string;
  phone: string | null | undefined;
  initialMessage: string;
  /** Orienta anexar PDF manualmente — sem envio automático. */
  documentHint?: boolean;
  onOpened?: () => void;
}) {
  const titleId = useId();
  const [message, setMessage] = useState(initialMessage);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMessage(initialMessage);
      setFeedback(null);
      setError(null);
    }
  }, [open, initialMessage]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const normalized = normalizePhoneForWhatsApp(phone);
  const phoneLabel = phone ? formatPhone(phone) || phone : "—";

  function onOpenWhatsApp() {
    setError(null);
    setFeedback(null);
    if (!normalized.ok) {
      setError(
        normalized.reason === "empty"
          ? "Paciente sem telefone cadastrado."
          : "Telefone inválido para WhatsApp.",
      );
      return;
    }
    const opened = openWhatsAppWeb(phone, message);
    if (!opened) {
      setError("Não foi possível abrir o WhatsApp. Verifique o bloqueio de pop-ups.");
      return;
    }
    setFeedback(documentHint ? WHATSAPP_FEEDBACK_DOCUMENT : WHATSAPP_FEEDBACK_OPENED);
    onOpened?.();
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-lotus-950/40 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-lotus-100 bg-white p-5 shadow-xl"
      >
        <h2 id={titleId} className="text-lg font-semibold text-lotus-950">
          Abrir WhatsApp Web
        </h2>
        <p className="mt-1 text-sm text-lotus-600">
          O Casa Florescer apenas prepara a conversa. O envio é feito por você no WhatsApp.
        </p>

        <dl className="mt-4 space-y-2 text-sm text-lotus-800">
          <div>
            <dt className="text-xs uppercase tracking-wide text-lotus-500">Destinatário</dt>
            <dd className="font-medium text-lotus-900">{recipientName || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-lotus-500">Telefone</dt>
            <dd>
              {phoneLabel}
              {normalized.ok ? (
                <span className="ml-2 text-xs text-lotus-500">({normalized.displayHint})</span>
              ) : null}
            </dd>
          </div>
        </dl>

        <label className="mt-4 block text-sm text-lotus-800">
          Mensagem
          <textarea
            className={`${fieldClass} min-h-[10rem] resize-y`}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            aria-label="Mensagem do WhatsApp"
          />
        </label>

        {error ? (
          <p className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
            {error}
          </p>
        ) : null}
        {feedback ? (
          <p className="mt-3 rounded-xl border border-lotus-100 bg-lotus-50 px-3 py-2 text-sm text-lotus-800" role="status">
            {feedback}
          </p>
        ) : null}

        <div className="mt-5 flex flex-row flex-wrap justify-end gap-2">
          <button type="button" className={ghostButtonClass} onClick={onClose}>
            {feedback ? "Fechar" : "Cancelar"}
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={!normalized.ok}
            onClick={onOpenWhatsApp}
          >
            Abrir WhatsApp Web
          </button>
        </div>
      </div>
    </div>
  );
}
