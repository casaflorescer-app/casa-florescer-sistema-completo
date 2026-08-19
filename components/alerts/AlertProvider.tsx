"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { AgendaAlert } from "@/lib/types/database";
import { previewAlerts } from "@/lib/preview/fixtures";
import { GlobalAlertHost } from "./GlobalAlertHost";

type AlertContextValue = {
  alerts: AgendaAlert[];
  pushAlert: (alert: AgendaAlert) => void;
  dismiss: (id: string) => void;
};

const AlertContext = createContext<AlertContextValue | null>(null);

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [alerts, setAlerts] = useState<AgendaAlert[]>(previewAlerts);

  const pushAlert = useCallback((alert: AgendaAlert) => {
    setAlerts((current) => [alert, ...current.filter((item) => item.id !== alert.id)]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setAlerts((current) => current.filter((item) => item.id !== id));
  }, []);

  const value = useMemo(
    () => ({ alerts, pushAlert, dismiss }),
    [alerts, pushAlert, dismiss],
  );

  return (
    <AlertContext.Provider value={value}>
      {children}
      <GlobalAlertHost />
    </AlertContext.Provider>
  );
}

export function useAlerts() {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error("useAlerts precisa do AlertProvider");
  return ctx;
}
