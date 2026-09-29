import type { AppointmentRow, OperationalAppointmentStatus } from "@/lib/attendance/directory";
import { buttonClass, ghostButtonClass } from "@/components/platform/Ui";
import {
  APPOINTMENT_KIND_LABEL,
  canEditAppointmentStatus,
  formatClock,
} from "@/components/attendance/agenda-display";
import { AppointmentStatusBadge } from "@/components/attendance/AppointmentStatusBadge";
import { ROOM_NATURE_LABEL, roomNature } from "@/lib/clinic/room-presentation";

const actionClass = buttonClass;
const ghostActionClass = ghostButtonClass;

export function AppointmentCard({
  row,
  busy,
  canStartEncounter,
  canEdit,
  editing,
  onEdit,
  onSetStatus,
  onStartEncounter,
}: {
  row: AppointmentRow;
  busy: boolean;
  canStartEncounter: boolean;
  canEdit: boolean;
  editing: boolean;
  onEdit: (appointmentId: string) => void;
  onSetStatus: (appointmentId: string, status: OperationalAppointmentStatus) => void;
  onStartEncounter: (appointmentId: string) => void;
}) {
  function cancel() {
    if (!window.confirm("Cancelar este agendamento?")) return;
    onSetStatus(row.id, "cancelled");
  }

  const procedureLabel = row.procedureName?.trim() || APPOINTMENT_KIND_LABEL[row.kind];
  const nature = row.roomName
    ? roomNature({ roomKind: row.roomKind, isHouse: row.roomIsHouse === true })
    : null;
  const showEdit = canEdit && canEditAppointmentStatus(row.status);

  return (
    <article className="card min-w-0">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[7.5rem_minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,0.9fr)_minmax(0,1fr)_auto] xl:items-start">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">Horário</p>
          <p className="mt-1 text-sm font-semibold text-lotus-900">
            {formatClock(row.startsAt)}–{formatClock(row.endsAt)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">Médica</p>
          <p className="mt-1 text-sm font-semibold text-lotus-900">
            {row.professionalName ?? "Profissional"}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">Sala</p>
          <p className="mt-1 text-sm text-lotus-900">{row.roomName ?? "—"}</p>
          {nature ? (
            <p className="mt-1">
              <span className="inline-flex rounded-full border border-lotus-200 bg-lotus-50 px-2.5 py-0.5 text-xs font-semibold text-lotus-800">
                {nature === "compartilhada" ? "Uso compartilhado" : ROOM_NATURE_LABEL[nature]}
              </span>
            </p>
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">Paciente</p>
          <h2 className="mt-1 text-sm font-semibold text-lotus-900">{row.patientName ?? "Paciente"}</h2>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">Procedimento</p>
          <p className="mt-1 text-sm text-lotus-900">{procedureLabel}</p>
        </div>
        <div className="sm:justify-self-end">
          <AppointmentStatusBadge status={row.status} />
        </div>
      </div>

      {row.urgencyNote ? <p className="mt-3 text-sm text-lotus-800">{row.urgencyNote}</p> : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {showEdit ? (
          <button
            type="button"
            className={ghostActionClass}
            disabled={busy || editing}
            onClick={() => onEdit(row.id)}
          >
            {editing ? "Editando…" : "Editar"}
          </button>
        ) : null}
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
