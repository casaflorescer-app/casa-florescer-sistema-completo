import type {
  AgendaBlockRow,
  AppointmentRow,
  OperationalAppointmentStatus,
} from "@/lib/attendance/directory";
import type { AppointmentPredictionView } from "@/lib/attendance/appointment-prediction";
import { formatDayLabel } from "@/components/attendance/agenda-display";
import { AppointmentCard } from "@/components/attendance/AppointmentCard";
import { AgendaBlockCard } from "@/components/attendance/AgendaBlockCard";

export function AgendaDayBoard({
  date,
  rows,
  blocks,
  blockAffectedCounts,
  professionalNames,
  roomNames,
  predictions,
  loading,
  busyId,
  canStartEncounter,
  canEdit,
  editingId,
  onEdit,
  onSetStatus,
  onStartEncounter,
  onRecordArrival,
}: {
  date: string;
  rows: AppointmentRow[];
  blocks?: AgendaBlockRow[];
  blockAffectedCounts?: Map<string, number>;
  professionalNames?: Map<string, string>;
  roomNames?: Map<string, string>;
  predictions: Map<string, AppointmentPredictionView>;
  loading: boolean;
  busyId: string | null;
  canStartEncounter: boolean;
  canEdit: boolean;
  editingId: string | null;
  onEdit: (appointmentId: string) => void;
  onSetStatus: (appointmentId: string, status: OperationalAppointmentStatus) => void;
  onStartEncounter: (appointmentId: string) => void;
  onRecordArrival: (appointmentId: string) => void;
}) {
  const dayBlocks = blocks ?? [];
  const empty = !loading && rows.length === 0 && dayBlocks.length === 0;

  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold capitalize text-lotus-800">{formatDayLabel(date)}</h2>
      {loading ? <p className="mt-4 text-sm text-lotus-600">Carregando agenda…</p> : null}
      {empty ? (
        <section className="card mt-4 text-sm text-lotus-700">
          Nenhum atendimento neste dia com os filtros atuais.
        </section>
      ) : null}
      {!loading && (rows.length > 0 || dayBlocks.length > 0) ? (
        <ul className="mt-4 space-y-3">
          {dayBlocks.map((block) => (
            <li key={block.id}>
              <AgendaBlockCard
                block={block}
                professionalName={
                  block.professionalId
                    ? professionalNames?.get(block.professionalId) ?? null
                    : null
                }
                roomName={block.roomId ? roomNames?.get(block.roomId) ?? null : null}
                affectedCount={blockAffectedCounts?.get(block.id) ?? 0}
              />
            </li>
          ))}
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
                onRecordArrival={onRecordArrival}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
