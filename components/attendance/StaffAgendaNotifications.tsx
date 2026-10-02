"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  dismissStaffNotification,
  listUnreadStaffNotifications,
  type StaffNotificationRow,
} from "@/lib/attendance/directory";

export function StaffAgendaNotifications({
  supabase,
  reloadKey,
  onOpenAgenda,
}: {
  supabase: SupabaseClient | null;
  reloadKey: number;
  onOpenAgenda?: () => void;
}) {
  const [items, setItems] = useState<StaffNotificationRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    void (async () => {
      const rows = await listUnreadStaffNotifications(supabase, 8);
      if (!cancelled) {
        setItems(rows.filter((item) => item.eventType.startsWith("AGENDA_")));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, reloadKey]);

  if (!supabase || items.length === 0) return null;

  const latest = items[0];

  return (
    <div className="mt-4 rounded-md border border-lotus-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-lotus-500">
        Notificação interna
      </p>
      <p className="mt-1 text-sm font-semibold text-lotus-900">{latest.title}</p>
      <p className="mt-1 text-sm text-lotus-700">{latest.message}</p>
      <div className="mt-2 flex flex-wrap gap-3">
        {onOpenAgenda ? (
          <button
            type="button"
            className="text-sm font-semibold text-lotus-800 underline-offset-2 hover:underline"
            onClick={onOpenAgenda}
          >
            Ver agenda
          </button>
        ) : null}
        <button
          type="button"
          className="text-sm font-semibold text-lotus-600 underline-offset-2 hover:underline disabled:opacity-50"
          disabled={busyId === latest.id}
          onClick={() => {
            void (async () => {
              setBusyId(latest.id);
              await dismissStaffNotification(supabase, latest.id);
              setItems((current) => current.filter((item) => item.id !== latest.id));
              setBusyId(null);
            })();
          }}
        >
          Dispensar
        </button>
      </div>
      {items.length > 1 ? (
        <p className="mt-2 text-xs text-lotus-500">+{items.length - 1} outras na central</p>
      ) : null}
    </div>
  );
}
