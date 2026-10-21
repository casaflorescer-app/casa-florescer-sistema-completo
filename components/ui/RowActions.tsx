"use client";

import Link from "next/link";
import {
  buttonCompactClass,
  buttonVariantClass,
  type ButtonVariant,
} from "@/components/ui/buttonStyles";
import { OverflowMenu, type OverflowItem } from "@/components/ui/OverflowMenu";

export type RowAction = {
  id: string;
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: ButtonVariant;
};

/**
 * Padrão obrigatório C064: uma ação principal visível + menu ⋯ para secundárias.
 * Sempre em linha (flex-row); no mobile o wrap é horizontal, nunca empilhamento
 * de dois botões full-width na coluna de tabela.
 */
export function RowActions({
  primary,
  secondary = [],
  className = "",
  compact = true,
}: {
  primary?: RowAction | null;
  secondary?: OverflowItem[];
  className?: string;
  compact?: boolean;
}) {
  const size = compact ? buttonCompactClass : "";

  return (
    <div
      className={`inline-flex flex-row flex-wrap items-center justify-end gap-2 ${className}`}
      data-row-actions="true"
    >
      {primary ? <ActionControl action={primary} sizeClass={size} /> : null}
      {secondary.length > 0 ? <OverflowMenu items={secondary} /> : null}
    </div>
  );
}

function ActionControl({
  action,
  sizeClass,
}: {
  action: RowAction;
  sizeClass: string;
}) {
  const variant = action.variant ?? "primary";
  const className = `${buttonVariantClass[variant]} ${sizeClass}`;
  if (action.href && !action.disabled) {
    return (
      <Link href={action.href} className={className}>
        {action.label}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={className}
      disabled={action.disabled}
      onClick={action.onClick}
    >
      {action.label}
    </button>
  );
}
