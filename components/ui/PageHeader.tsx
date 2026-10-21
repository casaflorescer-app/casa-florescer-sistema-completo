import type { ReactNode } from "react";

/**
 * Cabeçalho de página: título + descrição à esquerda, ação principal à direita.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">
            {eyebrow}
          </p>
        ) : null}
        <h1 className={`page-title ${eyebrow ? "mt-1" : ""}`}>{title}</h1>
        {description ? <p className="page-sub mt-2 max-w-2xl">{description}</p> : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-row flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
