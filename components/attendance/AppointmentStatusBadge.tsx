import { APPOINTMENT_STATUS_LABEL } from "@/lib/attendance/directory";
import type { AppointmentStatus } from "@/lib/types/database";

const TONE: Record<AppointmentStatus, string> = {
  scheduled: "border-lotus-200 bg-white text-lotus-800",
  confirmed: "border-lotus-200 bg-lotus-50 text-lotus-800",
  checked_in: "border-lotus-300 bg-lotus-100 text-lotus-900",
  in_progress: "border-lotus-800 bg-lotus-800 text-white",
  completed: "border-lotus-100 bg-lotus-50 text-lotus-600",
  no_show: "border-rose-100 bg-white text-rose-800",
  cancelled: "border-rose-100 bg-white text-rose-700",
};

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${TONE[status]}`}
    >
      {APPOINTMENT_STATUS_LABEL[status]}
    </span>
  );
}
