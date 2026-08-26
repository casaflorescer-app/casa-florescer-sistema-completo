"use client";

import { useState, type ReactNode } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { PracticeUiProvider } from "@/components/layout/PracticeUi";
import type { AuthorizationContext } from "@/lib/auth/authorization";
import { navSectionsFor } from "@/lib/auth/app-nav";

export function AppShell({
  authorization,
  children,
}: {
  authorization: AuthorizationContext;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const sections = navSectionsFor(authorization);

  return (
    <PracticeUiProvider memberships={authorization.memberships}>
      <div className="min-h-screen bg-lotus-50">
        <AppHeader onMenuToggle={() => setMenuOpen((open) => !open)} />
        <div className="lg:grid lg:grid-cols-[260px_1fr]">
          <AppSidebar
            sections={sections}
            open={menuOpen}
            onNavigate={() => setMenuOpen(false)}
          />
          <main className="view-enter mx-auto w-full max-w-5xl flex-1 px-4 py-6">
            {children}
          </main>
        </div>
      </div>
    </PracticeUiProvider>
  );
}

export function AppLoadingShell({ message = "Carregando acesso…" }: { message?: string }) {
  return (
    <div className="min-h-screen bg-lotus-50">
      <header className="border-b border-lotus-100 bg-white/90 px-4 py-3">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-lotus-700">
          Casa Florescer
        </p>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-10">
        <p className="text-sm text-lotus-600">{message}</p>
      </main>
    </div>
  );
}
