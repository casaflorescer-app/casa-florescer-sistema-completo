import type { AppointmentRow, OperationalAppointmentStatus } from "@/lib/attendance/directory";
import { buttonClass, ghostButtonClass } from "@/components/platform/Ui";
import { APPOINTMENT_KIND_LABEL, formatClock } from "@/components/attendance/agenda-display";
import { AppointmentStatusBadge } from "@/components/attendance/AppointmentStatusBadge";

const actionClass = `${buttonClass} px-3 py-1.5 text-xs`;
const ghostActionClass = `${ghostButtonClass} px-3 py-1.5 text-xs`;

export function AppointmentCard({
  row,
  busy,
  canStartEncounter,
  onSetStatus,
  onStartEncounter,
}: {
  row: AppointmentRow;
  busy: boolean;
  canStartEncounter: boolean;
  onSetStatus: (appointmentId: string, status: OperationalAppointmentStatus) => void;
  onStartEncounter: (appointmentId: string) => void;
}) {
  function cancel() {
    if (!window.confirm("Cancelar este agendamento?")) return;
    onSetStatus(row.id, "cancelled");
  }

  return (
    <article className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-lotus-800">
            {formatClock(row.startsAt)}–{formatClock(row.endsAt)}
          </p>
          <h2 className="mt-1 text-base font-semibold text-lotus-900">
            {row.patientName ?? "Paciente"}
          </h2>
          <p className="mt-1 text-sm text-lotus-700">
            {row.professionalName ?? "Profissional"} · {APPOINTMENT_KIND_LABEL[row.kind]}
            {row.roomName ? ` · ${row.roomName}` : ""}
          </p>
          {row.urgencyNote ? (
            <p className="mt-2 text-sm text-lotus-800">{row.urgencyNote}</p>
          ) : null}
        </div>
        <AppointmentStatusBadge status={row.status} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {row.status === "scheduled" ? (
          <>
            <button
              type="button"
              className={actionClass}
              disabled={busy}
              onClick={() => onSetStatus(row.id, "confirmed")}
            >
              Confirmar
            </button>
            <button type="button" className={ghostActionClass} disabled={busy} onClick={cancel}>
              Cancelar
            </button>
          </>
        ) : null}
        {row.status === "confirmed" ? (
          <>
            <button
              type="button"
              className={actionClass}
              disabled={busy}
              onClick={() => onSetStatus(row.id, "checked_in")}
            >
              Check-in
            </button>
            <button type="button" className={ghostActionClass} disabled={busy} onClick={cancel}>
              Cancelar
            </button>
          </>
        ) : null}
        {row.status === "checked_in" ? (
          <>
            <p className="text-sm text-lotus-700">Aguardar a médica</p>
            {canStartEncounter ? (
              <button
                type="button"
                className={actionClass}
                disabled={busy}
                onClick={() => onStartEncounter(row.id)}
              >
                Iniciar atendimento
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </article>
  );
}
