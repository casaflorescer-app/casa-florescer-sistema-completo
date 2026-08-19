import { capacityRules } from "@/lib/preview/fixtures";
import { APPOINTMENT_KIND_LABEL } from "@/lib/types/domain";

export default function CapacidadePage() {
  return (
    <div>
      <h1 className="page-title">Controle de capacidade</h1>
      <p className="page-sub">
        Defina o teto diário. A recepção não consegue marcar além deste limite,
        salvo encaixe autorizado por você.
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {capacityRules.map((rule) => (
          <form key={rule.kind} className="card space-y-3">
            <h2 className="font-semibold">
              {APPOINTMENT_KIND_LABEL[rule.kind]}
            </h2>
            <p className="text-sm text-lotus-600">
              Hoje: {rule.booked} de {rule.max} marcadas
            </p>
            <label className="block text-sm">
              Máximo por dia
              <input
                type="number"
                defaultValue={rule.max}
                min={1}
                className="mt-1 w-full rounded-xl border border-lotus-200 px-3 py-2"
              />
            </label>
            <button
              type="button"
              className="rounded-xl bg-lotus-700 px-4 py-2 text-sm font-semibold text-white"
            >
              Salvar teto
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
