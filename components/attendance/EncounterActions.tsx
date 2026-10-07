import { buttonClass, ghostButtonClass } from "@/components/platform/Ui";

export function EncounterActions({
  locked,
  busy,
  canEndAttendance,
  attendanceEnded,
  onSave,
  onSign,
  onEndAttendance,
}: {
  locked: boolean;
  busy: boolean;
  canEndAttendance: boolean;
  attendanceEnded: boolean;
  onSave: () => void;
  onSign: () => void;
  onEndAttendance: () => void;
}) {
  if (locked && attendanceEnded) return null;

  return (
    <div className="mt-4 flex flex-wrap gap-3">
      {!locked ? (
        <>
          <button type="button" className={buttonClass} disabled={busy} onClick={onSave}>
            {busy ? "Salvando…" : "Salvar evolução"}
          </button>
          <button type="button" className={ghostButtonClass} disabled={busy} onClick={onSign}>
            Assinar atendimento
          </button>
        </>
      ) : null}
      {canEndAttendance && !attendanceEnded ? (
        <button type="button" className={buttonClass} disabled={busy} onClick={onEndAttendance}>
          Encerrar atendimento
        </button>
      ) : null}
      {attendanceEnded ? (
        <p className="text-sm font-medium text-emerald-800">Término clínico registrado.</p>
      ) : null}
    </div>
  );
}
