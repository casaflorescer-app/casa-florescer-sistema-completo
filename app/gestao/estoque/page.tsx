const rows = [
  { name: "Luvas M", klass: "Clínico · lote", qty: "4 caixas", extra: "Validade 11/2026" },
  { name: "Soro 0,9%", klass: "Clínico · FEFO", qty: "12 un", extra: "Lote A19" },
  { name: "Café", klass: "Copa", qty: "2 kg", extra: "Saldo simples" },
  { name: "Copos", klass: "Copa", qty: "1 pacote", extra: "Abaixo do mínimo" },
];

export default function EstoquePage() {
  return (
    <div>
      <h1 className="page-title">Estoque híbrido</h1>
      <p className="page-sub">
        Material médico com lote e validade (FEFO). Copa só com saldo. Não
        misture as duas classes no mesmo movimento.
      </p>
      <ul className="mt-6 space-y-3">
        {rows.map((row) => (
          <li key={row.name} className="card flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold">{row.name}</p>
              <p className="text-sm text-lotus-600">{row.klass} · {row.extra}</p>
            </div>
            <p className="text-sm font-medium">{row.qty}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
