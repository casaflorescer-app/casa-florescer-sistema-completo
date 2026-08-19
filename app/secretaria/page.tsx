import Link from "next/link";

const rooms = [
  { name: "Sala 1 · Casa", status: "Dra. Samara · consulta" },
  { name: "Sala 2 · Casa", status: "Livre em 20 min" },
  { name: "Sala 3 · Sublocada", status: "Ocupada" },
  { name: "Sala 4 · Sublocada", status: "Livre" },
  { name: "Sala 5 · Sublocada", status: "Manutenção" },
];

export default function SecretariaHomePage() {
  return (
    <div>
      <h1 className="page-title">Recepção</h1>
      <p className="page-sub">
        Quatro secretarias ao mesmo tempo: a sala não aceita dois agendamentos
        no mesmo horário. Alertas de parto aparecem no topo.
      </p>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {rooms.map((room) => (
          <article key={room.name} className="card">
            <h2 className="font-semibold">{room.name}</h2>
            <p className="mt-1 text-sm text-lotus-600">{room.status}</p>
          </article>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-3 text-sm">
        <Link href="/secretaria/reagendamento" className="rounded-xl bg-lotus-700 px-4 py-2 font-semibold text-white">
          Reagendar em massa
        </Link>
        <Link href="/secretaria/exames" className="rounded-xl border border-lotus-200 bg-white px-4 py-2 font-medium">
          Fila de exames
        </Link>
      </div>
    </div>
  );
}
