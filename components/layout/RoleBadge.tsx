import type { UiRole } from "@/lib/types/domain";
import { UI_ROLE_LABEL } from "@/lib/types/domain";

export function RoleBadge({ role }: { role: UiRole }) {
  return (
    <span className="rounded-full bg-lotus-100 px-3 py-1 text-xs font-semibold text-lotus-800">
      {UI_ROLE_LABEL[role]}
    </span>
  );
}
