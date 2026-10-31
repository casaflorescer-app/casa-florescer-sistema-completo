import Link from "next/link";
import type { ReactNode } from "react";

export type ActionLink = {
  id: string;
  label: string;
  href: string;
};

/**
 * Links contextuais leves (paciente → prontuário / exames / receitas).
 * Não compete com a ação principal da página.
 * C070-C4.3
 */
export function ActionLinkBar({
  items,
  label = "Atalhos",
  trailing,
}: {
  items: ActionLink[];
  label?: string;
  trailing?: ReactNode;
}) {
  if (items.length === 0 && !trailing) return null;

  return (
    <nav
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
      aria-label={label}
      data-action-link-bar="true"
    >
      {items.map((item, index) => (
        <span key={item.id} className="inline-flex items-center gap-3">
          {index > 0 ? (
            <span className="text-lotus-300" aria-hidden>
              ·
            </span>
          ) : null}
          <Link
            href={item.href}
            className="font-medium text-lotus-800 underline-offset-2 hover:underline"
          >
            {item.label}
          </Link>
        </span>
      ))}
      {trailing}
    </nav>
  );
}
