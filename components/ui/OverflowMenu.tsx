"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { MoreHorizontal, Plus } from "lucide-react";
import { buttonCompactClass, buttonVariantClass } from "@/components/ui/buttonStyles";

export type OverflowItem = {
  id: string;
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
};

export type OverflowTriggerVariant = "labeled" | "icon";

/**
 * Menu de ações secundárias.
 * Default C070-C7: trigger legível "+ Ações" (não ícone isolado que parece "-").
 * `variant="icon"` → ⋮ compacto quando o layout exige.
 */
export function OverflowMenu({
  items,
  label = "Ações",
  align = "end",
  variant = "labeled",
}: {
  items: OverflowItem[];
  label?: string;
  align?: "start" | "end";
  variant?: OverflowTriggerVariant;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const visible = items.filter((item) => item.label);
  const triggerText = label === "Mais ações" || label === "Ações" ? "+ Ações" : label;

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (visible.length === 0) return null;

  const isIcon = variant === "icon";
  const triggerClass = isIcon
    ? `${buttonVariantClass.secondary} min-h-9 w-9 shrink-0 px-0`
    : `${buttonVariantClass.secondary} ${buttonCompactClass}`;

  return (
    <div className="relative inline-flex" ref={rootRef} data-overflow-menu="true">
      <button
        type="button"
        className={triggerClass}
        aria-label={triggerText}
        title={triggerText}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        data-overflow-trigger={variant}
        onClick={() => setOpen((v) => !v)}
      >
        {isIcon ? (
          <MoreHorizontal className="h-5 w-5" aria-hidden />
        ) : (
          <>
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
            <span>Ações</span>
          </>
        )}
      </button>
      {open ? (
        <ul
          id={menuId}
          role="menu"
          aria-label={triggerText}
          className={`absolute z-40 mt-1 min-w-[12rem] rounded-xl border border-lotus-100 bg-white py-1 shadow-lg ${
            align === "end" ? "right-0" : "left-0"
          }`}
        >
          {visible.map((item) => {
            const itemClass = `flex w-full items-center px-3 py-2.5 text-left text-sm ${
              item.danger ? "text-rose-800" : "text-lotus-900"
            } hover:bg-lotus-50 disabled:opacity-50`;
            if (item.href && !item.disabled) {
              return (
                <li key={item.id} role="none">
                  <Link
                    role="menuitem"
                    href={item.href}
                    className={itemClass}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            }
            return (
              <li key={item.id} role="none">
                <button
                  type="button"
                  role="menuitem"
                  className={itemClass}
                  disabled={item.disabled}
                  onClick={() => {
                    item.onClick?.();
                    setOpen(false);
                  }}
                >
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
