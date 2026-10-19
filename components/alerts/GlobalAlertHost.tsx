"use client";

import { usePathname } from "next/navigation";
import { useAlerts } from "./AlertProvider";

export function GlobalAlertHost() {
  const pathname = usePathname();
  const { alerts, dismiss } = useAlerts();
  const staffView =
    pathname.startsWith("/app") ||
    pathname.startsWith("/medica") ||
    pathname.startsWith("/secretaria") ||
    pathname.startsWith("/gestao");

  if (!staffView) return null;
  const active = alerts.filter((alert) => !alert.acknowledged_at);
  if (active.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[60] flex justify-center px-4 sm:bottom-auto sm:top-[max(4.75rem,calc(env(safe-area-inset-top)+4.25rem))]">
      <div className="flex w-full max-w-xl flex-col gap-2">
        {active.map((alert) => (
          <div
            key={alert.id}
            className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-lg ${
              alert.severity === "urgent"
                ? "border-lotus-700 bg-lotus-800 text-white"
                : "border-lotus-200 bg-white text-lotus-900"
            }`}
            role="alert"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
                  Alerta de agenda
                </p>
                <p className="mt-0.5 font-semibold">{alert.title}</p>
                <p className="mt-1 text-sm opacity-90">{alert.body}</p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(alert.id)}
                className="min-h-11 shrink-0 rounded-full px-3 py-1 text-sm opacity-80 hover:opacity-100"
              >
                Ok
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
