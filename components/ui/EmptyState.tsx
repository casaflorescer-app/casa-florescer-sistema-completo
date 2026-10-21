import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border border-dashed border-lotus-200 bg-white px-6 py-10 text-center"
      data-empty-state="true"
    >
      <p className="text-base font-semibold text-lotus-900">{title}</p>
      {description ? <p className="mx-auto mt-2 max-w-md text-sm text-lotus-600">{description}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
