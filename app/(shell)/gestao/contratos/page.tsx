import { requireModule } from "@/components/layout/RoleGate";
import {
  PHYSICAL_ROOMS,
  RENTAL_PREVIEW,
  ROOM_KIND_LABEL,
} from "@/lib/ops/spaces";

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function ContratosPage() {
  await requireModule("contratos");
  const groups = [
    "house_consultorio",
    "sublet_consultorio",
    "pharmacy",
    "procedure",
    "reception",
  ] as const;

  return (
    <div>
      <h1 className="page-title">Contratos e sublocações</h1>
      <p className="page-sub">
        Dois consultórios da casa (GO). Os demais são aluguel com água, luz e
        internet já no valor fechado. O extrato do inquilino é um único total
        por mês.
      </p>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-lotus-500">
        Mapa da casa
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {groups.flatMap((kind) =>
          PHYSICAL_ROOMS.filter((room) => room.kind === kind).map((room) => (
            <article key={room.code} className="card">
              <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">
                {ROOM_KIND_LABEL[room.kind]}
              </p>
              <p className="mt-1 font-semibold text-lotus-900">
                {room.code} · {room.name}
              </p>
              <p className="mt-1 text-sm text-lotus-700">{room.occupant}</p>
              <p className="mt-1 text-sm text-lotus-600">{room.note}</p>
            </article>
          )),
        )}
      </div>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-lotus-500">
        Contratos ativos
      </h2>
      <ul className="mt-3 space-y-3">
        {RENTAL_PREVIEW.map((row) => (
          <li key={row.room} className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-lotus-900">
                  {row.room} · {row.tenant}
                </p>
                <p className="text-sm text-lotus-600">{row.specialty}</p>
              </div>
              <p className="text-lg font-semibold text-lotus-800">
                {money(row.monthlyReais)}
                <span className="block text-right text-xs font-normal text-lotus-500">
                  / mês
                </span>
              </p>
            </div>
            <p className="mt-3 text-sm text-lotus-700">
              Incluso no valor: água, luz e internet.
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {["Água", "Luz", "Internet"].map((item) => (
                <span
                  key={item}
                  className="rounded-full bg-lotus-100 px-2.5 py-1 font-semibold text-lotus-800"
                >
                  {item} incluso
                </span>
              ))}
            </div>
            <p className="mt-3 text-sm text-lotus-600">
              Vigência até {row.until} · último extrato {row.lastStatement}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
