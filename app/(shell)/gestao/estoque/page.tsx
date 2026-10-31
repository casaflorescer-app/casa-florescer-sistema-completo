import { requireModule } from "@/components/layout/RoleGate";
import { STOCK_PREVIEW } from "@/lib/ops/spaces";

const SECTOR_LABEL = {
  pharmacy: "Sala de Medicamentos",
  procedure: "Sala de Procedimentos",
  reception: "Recepção",
} as const;

export default async function EstoquePage() {
  await requireModule("estoque");
  const alerts = STOCK_PREVIEW.filter((row) => row.belowMin);

  return (
    <div>
      <h1 className="page-title">Estoque da casa</h1>
      <p className="page-sub">
        Visão única da gestora e da secretaria: insumos dos consultórios
        próprios, das salas sublocadas, da Sala de Medicamentos e da Sala de
        Procedimentos.
      </p>

      {alerts.length > 0 ? (
        <div
          className="mt-6 rounded-2xl border border-lotus-700 bg-lotus-800 px-4 py-3 text-white"
          role="alert"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-white/80">
            Reposição urgente
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {alerts.map((row) => (
              <li key={row.name}>
                {row.name} — {SECTOR_LABEL[row.sector]} ({row.qtyLabel}, {row.minLabel})
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ul className="mt-6 space-y-3">
        {STOCK_PREVIEW.map((row) => (
          <li
            key={row.name}
            className={`card ${row.belowMin ? "border-lotus-400 bg-lotus-50" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-lotus-900">{row.name}</p>
                <p className="text-sm text-lotus-600">{SECTOR_LABEL[row.sector]}</p>
                {row.linkedTo ? (
                  <p className="mt-1 text-xs text-lotus-500">Retirada: {row.linkedTo}</p>
                ) : null}
              </div>
              <div className="text-right">
                <p className="text-sm font-medium">{row.qtyLabel}</p>
                <p className="text-xs text-lotus-500">{row.minLabel}</p>
                {row.belowMin ? (
                  <p className="mt-1 text-xs font-semibold text-lotus-800">Repor agora</p>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
