import { APPOINTMENT_STATUSES, APPOINTMENT_STATUS_LABEL } from "@/lib/attendance/directory";
import type { ProfessionalLabel } from "@/lib/pregnancies/directory";
import type { AppointmentStatus } from "@/lib/types/database";
import { fieldClass, ghostButtonClass } from "@/components/platform/Ui";
import { addDaysInputDate, todayInputDate } from "@/components/attendance/agenda-display";

const labelClass = "text-xs font-semibold uppercase tracking-wide text-lotus-500";

export function AgendaFilters({
  dateFrom,
  dateTo,
  professionalId,
  status,
  professionals,
  onDateFromChange,
  onDateToChange,
  onRangeChange,
  onProfessionalChange,
  onStatusChange,
}: {
  dateFrom: string;
  dateTo: string;
  professionalId: string;
  status: AppointmentStatus | "";
  professionals: ProfessionalLabel[];
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onRangeChange: (from: string, to: string) => void;
  onProfessionalChange: (value: string) => void;
  onStatusChange: (value: AppointmentStatus | "") => void;
}) {
  const today = todayInputDate();

  return (
    <div className="mt-6 space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={ghostButtonClass}
          onClick={() => onRangeChange(today, today)}
        >
          Hoje
        </button>
        <button
          type="button"
          className={ghostButtonClass}
          onClick={() => onRangeChange(today, addDaysInputDate(today, 6))}
        >
          7 dias
        </button>
        <button
          type="button"
          className={ghostButtonClass}
          onClick={() => onRangeChange(today, addDaysInputDate(today, 13))}
        >
          14 dias
        </button>
        <button
          type="button"
          className={ghostButtonClass}
          onClick={() => {
            const start = addDaysInputDate(today, -((new Date(`${today}T12:00:00`).getDay() + 6) % 7));
            onRangeChange(start, addDaysInputDate(start, 6));
          }}
        >
          Esta semana
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className={labelClass}>
          De
          <input
            type="date"
            className={fieldClass}
            value={dateFrom}
            onChange={(event) => onDateFromChange(event.target.value)}
          />
        </label>
        <label className={labelClass}>
          Até
          <input
            type="date"
            className={fieldClass}
            value={dateTo}
            min={dateFrom}
            onChange={(event) => onDateToChange(event.target.value)}
          />
        </label>
        <label className={labelClass}>
          Profissional
          <select
            className={fieldClass}
            value={professionalId}
            onChange={(event) => onProfessionalChange(event.target.value)}
          >
            <option value="">Todas</option>
            {professionals.map((item) => (
              <option key={item.id} value={item.id}>
                {item.fullName}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Status
          <select
            className={fieldClass}
            value={status}
            onChange={(event) => onStatusChange(event.target.value as AppointmentStatus | "")}
          >
            <option value="">Todos</option>
            {APPOINTMENT_STATUSES.map((item) => (
              <option key={item} value={item}>
                {APPOINTMENT_STATUS_LABEL[item]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
