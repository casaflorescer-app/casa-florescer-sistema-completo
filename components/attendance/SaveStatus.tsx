export function SaveStatus({
  dirty,
  saving,
  savedAt,
  error,
}: {
  dirty: boolean;
  saving: boolean;
  savedAt: string | null;
  error?: string | null;
}) {
  if (error) {
    return <p className="text-xs font-medium text-rose-700">Falha ao salvar: {error}</p>;
  }
  if (saving) {
    return <p className="text-xs font-medium text-lotus-600">Salvando…</p>;
  }
  if (dirty) {
    return <p className="text-xs font-medium text-amber-800">● Alterações não salvas</p>;
  }
  if (savedAt) {
    return (
      <p className="text-xs font-medium text-emerald-800">
        ✓ Rascunho salvo às{" "}
        {new Intl.DateTimeFormat("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(new Date(savedAt))}
      </p>
    );
  }
  return <p className="text-xs text-lotus-500">Sem alterações neste atendimento</p>;
}
