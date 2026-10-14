import { buttonClass, ghostButtonClass } from "@/components/platform/Ui";

export function EncounterActions({
  locked,
  busy,
  canEndAttendance,
  attendanceEnded,
  hideSign = false,
  onSave,
  onSign,
  onEndAttendance,
}: {
  locked: boolean;
  busy: boolean;
  canEndAttendance: boolean;
  attendanceEnded: boolean;
  /** Quando a assinatura é acionada pela Revisão final. */
  hideSign?: boolean;
  onSave: () => void;
  onSign: () => void;
  onEndAttendance: () => void;
}) {
  if (locked && attendanceEnded) return null;

  return (
    <div id="encerramento" className="mt-4 flex flex-wrap gap-3 scroll-mt-16">
      {!locked ? (
        <>
          <button type="button" className={buttonClass} disabled={busy} onClick={onSave}>
            {busy ? "Salvando…" : "Salvar rascunho"}
          </button>
          {!hideSign ? (
            <button type="button" className={ghostButtonClass} disabled={busy} onClick={onSign}>
              Assinar atendimento
            </button>
          ) : null}
        </>
      ) : null}
      {canEndAttendance && !attendanceEnded ? (
        <button type="button" className={buttonClass} disabled={busy} onClick={onEndAttendance}>
          Encerrar atendimento
        </button>
      ) : null}
      {attendanceEnded ? (
        <p className="text-sm font-medium text-emerald-800" role="status">
          Término clínico registrado (`actual_end_at`).
        </p>
      ) : null}
    </div>
  );
}
