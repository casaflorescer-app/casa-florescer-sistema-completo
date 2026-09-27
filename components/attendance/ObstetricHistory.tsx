import { formatDateTime } from "@/lib/platform/format";

export type ObstetricHistoryItem = {
  id: string;
  label: string;
  occurredAt: string;
  detail: string;
};

export function ObstetricHistory({
  items,
  error,
}: {
  items: ObstetricHistoryItem[];
  error: string | null;
}) {
  return (
    <section className="card mt-4" aria-labelledby="obstetric-history-title">
      <h2 id="obstetric-history-title" className="text-base font-semibold text-lotus-900">
        Histórico obstétrico
      </h2>
      {error ? (
        <p className="mt-3 text-sm text-rose-800" role="alert">
          {error}
        </p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-lotus-600">Nenhum evento obstétrico registrado.</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-xl border border-lotus-100 px-3 py-3 text-sm">
              <p className="font-medium text-lotus-900">{item.label}</p>
              <p className="mt-1 text-lotus-600">{formatDateTime(item.occurredAt)}</p>
              {item.detail ? <p className="mt-2 text-lotus-800">{item.detail}</p> : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
