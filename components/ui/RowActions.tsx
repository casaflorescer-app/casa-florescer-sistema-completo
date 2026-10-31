"use client";

import Link from "next/link";
import {
  buttonCompactClass,
  buttonVariantClass,
  type ButtonVariant,
} from "@/components/ui/buttonStyles";
import {
  OverflowMenu,
  type OverflowItem,
  type OverflowTriggerVariant,
} from "@/components/ui/OverflowMenu";

export type RowAction = {
  id: string;
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: ButtonVariant;
};

/**
 * Padrão C070-C7: ação principal + menu "+ Ações" na mesma linha (desktop).
 * No mobile estreito pode quebrar; nunca empilha por padrão no desktop.
 */
export function RowActions({
  primary,
  secondary = [],
  className = "",
  compact = true,
  overflowVariant = "labeled",
}: {
  primary?: RowAction | null;
  secondary?: OverflowItem[];
  className?: string;
  compact?: boolean;
  overflowVariant?: OverflowTriggerVariant;
}) {
  const size = compact ? buttonCompactClass : "";

  return (
    <div
      className={`inline-flex flex-row flex-nowrap items-center justify-end gap-1.5 max-sm:flex-wrap ${className}`}
      data-row-actions="true"
    >
      {primary ? <ActionControl action={primary} sizeClass={size} /> : null}
      {secondary.length > 0 ? (
        <OverflowMenu items={secondary} variant={overflowVariant} />
      ) : null}
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
