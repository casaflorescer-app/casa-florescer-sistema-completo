import { requireModule } from "@/components/layout/RoleGate";

export default async function AuditoriaPage() {
  await requireModule("auditoria");
  return (
    <div>
      <h1 className="page-title">Auditoria de estoque</h1>
      <p className="page-sub">
        Conferência periódica: esperado vs contado. Diferença gera movimento de
        ajuste, nunca edição do saldo antigo.
      </p>
      <div className="card mt-6">
        <p className="font-semibold">Próxima contagem</p>
        <p className="mt-1 text-sm text-lotus-700">Sala 1 · clínico · 25/08/2026</p>
        <button type="button" className="mt-4 rounded-xl bg-lotus-700 px-4 py-2 text-sm font-semibold text-white">
          Iniciar conferência
        </button>
      </div>
    </div>
  );
}
