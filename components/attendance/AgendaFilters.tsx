import { APPOINTMENT_STATUSES, APPOINTMENT_STATUS_LABEL } from "@/lib/attendance/directory";
import type { ProfessionalLabel } from "@/lib/pregnancies/directory";
import type { AppointmentStatus } from "@/lib/types/database";
import { fieldClass } from "@/components/platform/Ui";

const labelClass = "text-xs font-semibold uppercase tracking-wide text-lotus-500";

export function AgendaFilters({
  date,
  professionalId,
  status,
  professionals,
  onDateChange,
  onProfessionalChange,
  onStatusChange,
}: {
  date: string;
  professionalId: string;
  status: AppointmentStatus | "";
  professionals: ProfessionalLabel[];
  onDateChange: (value: string) => void;
  onProfessionalChange: (value: string) => void;
  onStatusChange: (value: AppointmentStatus | "") => void;
}) {
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-3">
      <label className={labelClass}>
        Data
        <input
          type="date"
          className={fieldClass}
          value={date}
          onChange={(event) => onDateChange(event.target.value)}
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
  );
}
