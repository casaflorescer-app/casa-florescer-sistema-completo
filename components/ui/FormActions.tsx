import type { ReactNode } from "react";
import { buttonVariantClass } from "@/components/ui/buttonStyles";

/**
 * Rodapé de formulário: ação principal + cancelar na mesma linha (desktop).
 * Empilha no mobile quando necessário.
 * C070-C4.3
 */
export function FormActions({
  primaryLabel,
  onPrimary,
  primaryDisabled,
  primaryBusy,
  busyLabel = "Salvando…",
  cancelLabel = "Cancelar",
  onCancel,
  danger = false,
  extra,
}: {
  primaryLabel: string;
  onPrimary?: () => void;
  primaryDisabled?: boolean;
  primaryBusy?: boolean;
  busyLabel?: string;
  cancelLabel?: string;
  onCancel?: () => void;
  danger?: boolean;
  extra?: ReactNode;
}) {
  const primaryClass = danger ? buttonVariantClass.danger : buttonVariantClass.primary;

  return (
    <div
      className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end"
      data-form-actions="true"
    >
      {extra}
      {onCancel ? (
        <button
          type="button"
          className={buttonVariantClass.ghost}
          disabled={primaryBusy}
          onClick={onCancel}
        >
          {cancelLabel}
        </button>
      ) : null}
      <button
        type={onPrimary ? "button" : "submit"}
        className={primaryClass}
        disabled={primaryDisabled || primaryBusy}
        onClick={onPrimary}
      >
        {primaryBusy ? busyLabel : primaryLabel}
      </button>
    </div>
  );
}
