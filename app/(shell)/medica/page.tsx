import Link from "next/link";
import { requireModule } from "@/components/layout/RoleGate";
import { obstetricBoard } from "@/lib/preview/fixtures";

export default async function MedicaHomePage() {
  await requireModule("obstetrico");
  return (
    <div>
      <h1 className="page-title">Programação obstétrica</h1>
      <p className="page-sub">
        Datas prováveis de parto e janelas de alta demanda — para a médica
        decidir capacidade antes da recepção encaixar.
      </p>
      <div className="mt-6 grid gap-3">
        {obstetricBoard.map((row) => (
          <article key={row.patient} className="card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-lotus-900">{row.patient}</h2>
                <p className="text-sm text-lotus-600">
                  {row.week} · risco {row.risk}
                </p>
              </div>
              <p className="rounded-full bg-lotus-100 px-3 py-1 text-xs font-semibold text-lotus-800">
                DPP {new Date(row.edd).toLocaleDateString("pt-BR")}
              </p>
            </div>
            <p className="mt-3 text-sm text-lotus-800">{row.demand}</p>
          </article>
        ))}
      </div>
      <Link
        href="/medica/prontuario"
        className="mt-6 inline-block text-sm font-medium text-lotus-700"
      >
        Abrir prontuário rápido →
      </Link>
    </div>
  );
}
