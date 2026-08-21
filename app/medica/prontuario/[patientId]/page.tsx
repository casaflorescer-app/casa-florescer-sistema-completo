import { requireModule } from "@/components/layout/RoleGate";
import { ClinicalSnapshot } from "@/components/patients/ClinicalSnapshot";

export function generateStaticParams() {
  return [
    { patientId: "p1" },
    { patientId: "p2" },
    { patientId: "p3" },
    { patientId: "preview-helena" },
  ];
}

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
      <p className="page-sub">Prática isolada · notas clínicas não aparecem na recepção.</p>
      <div className="mt-6">
        <ClinicalSnapshot patientId={params.patientId} />
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className="card">
          <h2 className="font-semibold">Gestação atual</h2>
          <p className="mt-3 text-sm text-lotus-700">
            DUM e DPP da ficha de cadastro aparecem no painel rosa. A evolução
            do pré-natal (risco, exames, conduta) continua neste prontuário.
          </p>
        </section>
        <section className="card">
          <h2 className="font-semibold">Notas da prática</h2>
          <p className="mt-3 text-sm text-lotus-700">
            As anotações de consulta não entram no MPI da casa e a secretaria
            não lê este conteúdo.
          </p>
        </section>
      </div>
    </div>
  );
}
