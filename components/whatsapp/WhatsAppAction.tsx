"use client";

import { useState } from "react";
import { isValidWhatsAppPhone } from "@/lib/whatsapp/phone";
import { buildAdministrativeHelloMessage } from "@/lib/whatsapp/messages";
import { buttonVariantClass, buttonCompactClass } from "@/components/ui/buttonStyles";
import { WhatsAppComposeDialog } from "@/components/whatsapp/WhatsAppComposeDialog";

/**
 * Ação WhatsApp Web — nunca simula envio/entrega/leitura.
 * Abre diálogo de revisão e depois wa.me.
 */
export function WhatsAppAction({
  phone,
  recipientName,
  message,
  label = "WhatsApp",
  compact = false,
  documentHint = false,
  className = "",
  onOpened,
}: {
  phone: string | null | undefined;
  recipientName: string;
  message?: string;
  label?: string;
  compact?: boolean;
  documentHint?: boolean;
  className?: string;
  onOpened?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const valid = isValidWhatsAppPhone(phone);
  const finalMessage = message ?? buildAdministrativeHelloMessage(recipientName || "paciente");

  const disabledTitle = !phone
    ? "Paciente sem telefone cadastrado."
    : !valid
      ? "Telefone inválido para WhatsApp."
      : undefined;

  return (
    <>
      <button
        type="button"
        className={`${buttonVariantClass.secondary} ${compact ? buttonCompactClass : ""} ${className}`}
        disabled={!valid}
        title={disabledTitle}
        aria-label={valid ? "Abrir WhatsApp Web" : disabledTitle}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      <WhatsAppComposeDialog
        open={open}
        onClose={() => setOpen(false)}
        recipientName={recipientName}
        phone={phone}
        initialMessage={finalMessage}
        documentHint={documentHint}
        onOpened={onOpened}
      />
    </>
  );
}
