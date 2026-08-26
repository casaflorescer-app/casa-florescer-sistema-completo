export function PlatformBanner({
  title,
  description,
  area = "plataforma",
}: {
  title: string;
  description: string;
  area?: "plataforma" | "clinica";
}) {
  return (
    <div className="mb-6">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">
        {area === "clinica" ? "Administração da clínica" : "Administração da plataforma"}
      </p>
      <h1 className="page-title mt-1">{title}</h1>
      <p className="page-sub mt-2">{description}</p>
    </div>
  );
}

export function StatusMessage({
  error,
  notice,
}: {
  error?: string | null;
  notice?: string | null;
}) {
  return (
    <>
      {error ? (
        <p className="mb-4 rounded-xl border border-rose-100 bg-white px-4 py-3 text-sm text-rose-800" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mb-4 rounded-xl border border-lotus-100 bg-white px-4 py-3 text-sm text-lotus-800">
          {notice}
        </p>
      ) : null}
    </>
  );
}

export const fieldClass =
  "mt-1 w-full rounded-xl border border-lotus-100 bg-white px-3 py-2 text-sm text-lotus-900 outline-none focus:border-lotus-300 focus:ring-2 focus:ring-lotus-200";

export const buttonClass =
  "rounded-xl bg-lotus-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-lotus-900 disabled:opacity-50";

export const ghostButtonClass =
  "rounded-xl border border-lotus-200 px-4 py-2 text-sm text-lotus-800 hover:bg-lotus-50 disabled:opacity-50";
