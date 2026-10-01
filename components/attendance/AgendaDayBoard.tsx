import type { AppointmentRow, OperationalAppointmentStatus } from "@/lib/attendance/directory";
import type { AppointmentPredictionView } from "@/lib/attendance/appointment-prediction";
import { formatDayLabel } from "@/components/attendance/agenda-display";
import { AppointmentCard } from "@/components/attendance/AppointmentCard";

export function AgendaDayBoard({
  date,
  rows,
  predictions,
  loading,
  busyId,
  canStartEncounter,
  canEdit,
  editingId,
  onEdit,
  onSetStatus,
  onStartEncounter,
}: {
  date: string;
  rows: AppointmentRow[];
  predictions: Map<string, AppointmentPredictionView>;
  loading: boolean;
  busyId: string | null;
  canStartEncounter: boolean;
  canEdit: boolean;
  editingId: string | null;
  onEdit: (appointmentId: string) => void;
  onSetStatus: (appointmentId: string, status: OperationalAppointmentStatus) => void;
  onStartEncounter: (appointmentId: string) => void;
}) {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold capitalize text-lotus-800">{formatDayLabel(date)}</h2>
      {loading ? <p className="mt-4 text-sm text-lotus-600">Carregando agenda…</p> : null}
      {!loading && rows.length === 0 ? (
        <section className="card mt-4 text-sm text-lotus-700">
          Nenhum atendimento neste dia com os filtros atuais.
        </section>
      ) : null}
      {!loading && rows.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {rows.map((row) => (
            <li key={row.id}>
              <AppointmentCard
                row={row}
                prediction={predictions.get(row.id) ?? null}
                busy={busyId === row.id}
                canStartEncounter={canStartEncounter}
                canEdit={canEdit}
                editing={editingId === row.id}
                onEdit={onEdit}
                onSetStatus={onSetStatus}
                onStartEncounter={onStartEncounter}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
