import type { ReactNode } from "react";

/**
 * Célula de coluna AÇÕES: largura mínima, alinhamento vertical e sem quebra forçada.
 */
export function TableActionsCell({
  children,
  className = "",
  as: Tag = "td",
}: {
  children: ReactNode;
  className?: string;
  as?: "td" | "div";
}) {
  return (
    <Tag
      className={`align-middle whitespace-nowrap ${className}`}
      data-table-actions-cell="true"
      style={Tag === "td" ? { minWidth: "11.5rem" } : undefined}
    >
      <div className="flex items-center justify-end gap-1.5">{children}</div>
    </Tag>
  );
}
