"use client";

import { createContext, useContext, useMemo } from "react";
import type { SessionContext } from "@/lib/types/domain";
import {
  hasModule,
  modulesForSidebar,
  type ModuleId,
} from "@/lib/permissions";
import { navSectionsFor } from "@/lib/nav";

type PermissionsValue = {
  session: SessionContext;
  can: (moduleId: ModuleId) => boolean;
  modules: ReturnType<typeof modulesForSidebar>;
  navSections: ReturnType<typeof navSectionsFor>;
};

const PermissionsContext = createContext<PermissionsValue | null>(null);

export function PermissionsProvider({
  session,
  children,
}: {
  session: SessionContext;
  children: React.ReactNode;
}) {
  const value = useMemo<PermissionsValue>(
    () => ({
      session,
      can: (moduleId) => hasModule(session.permissions, moduleId),
      modules: modulesForSidebar(session.permissions),
      navSections: navSectionsFor(session.uiRole, session.permissions),
    }),
    [session],
  );

  return (
    <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>
  );
}

export function usePermissions() {
  const ctx = useContext(PermissionsContext);
  if (!ctx) {
    throw new Error("usePermissions() precisa do PermissionsProvider");
  }
  return ctx;
}
