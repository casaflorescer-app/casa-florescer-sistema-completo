import { buttonClass, ghostButtonClass } from "@/components/platform/Ui";

export function EncounterActions({
  locked,
  busy,
  onSave,
  onSign,
}: {
  locked: boolean;
  busy: boolean;
  onSave: () => void;
  onSign: () => void;
}) {
  if (locked) return null;

  return (
    <div className="mt-4 flex flex-wrap gap-3">
      <button type="button" className={buttonClass} disabled={busy} onClick={onSave}>
        {busy ? "Salvando…" : "Salvar evolução"}
      </button>
      <button type="button" className={ghostButtonClass} disabled={busy} onClick={onSign}>
        Assinar atendimento
      </button>
    </div>
  );
}
