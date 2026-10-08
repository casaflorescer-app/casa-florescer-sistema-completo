export function WorkspaceComingSoon({
  id,
  title,
  stage,
  children,
}: {
  id: string;
  title: string;
  stage: string;
  children?: React.ReactNode;
}) {
  return (
    <section id={id} className="card mt-4 scroll-mt-16 overflow-x-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-lotus-900">{title}</h2>
          <p className="mt-1 text-sm text-lotus-600">
            Espaço reservado no Workspace Médico. Implementação em {stage}.
          </p>
        </div>
        <span className="inline-flex rounded-full border border-lotus-200 bg-lotus-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-lotus-700">
          Em breve
        </span>
      </div>
      {children}
    </section>
  );
}
