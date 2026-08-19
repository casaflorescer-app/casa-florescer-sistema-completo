import { requireModule } from "@/components/layout/RoleGate";

export default async function ProntuarioPacientePage({
  params,
}: {
  params: { patientId: string };
}) {
  await requireModule("prontuario");
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">
        Prontuário · GO
      </p>
      <h1 className="page-title">Histórico obstétrico</h1>
      <p className="page-sub">Paciente {params.patientId} · prática isolada</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className="card">
          <h2 className="font-semibold">Gestação atual</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-lotus-600">DUM</dt>
              <dd>15/11/2025</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-lotus-600">DPP</dt>
              <dd>22/08/2026</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-lotus-600">Tipo sanguíneo</dt>
              <dd>O+</dd>
            </div>
          </dl>
        </section>
        <section className="card">
          <h2 className="font-semibold">Antecedentes</h2>
          <p className="mt-3 text-sm text-lotus-700">
            1 parto vaginal (2023). Sem cesárea. Alergia a dipirona: não.
          </p>
        </section>
      </div>
    </div>
  );
}
