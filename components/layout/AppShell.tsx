"use client";

import { useEffect, useState, type ReactNode } from "react";
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

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <PracticeUiProvider memberships={authorization.memberships}>
      <div className="min-h-screen bg-lotus-50">
        <AppHeader
          menuOpen={menuOpen}
          onMenuToggle={() => setMenuOpen((open) => !open)}
        />
        {menuOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-lotus-900/40 lg:hidden"
            aria-label="Fechar menu"
            onClick={() => setMenuOpen(false)}
          />
        ) : null}
        <div className="lg:grid lg:grid-cols-[minmax(240px,260px)_minmax(0,1fr)]">
          <AppSidebar
            sections={sections}
            open={menuOpen}
            onNavigate={() => setMenuOpen(false)}
            onClose={() => setMenuOpen(false)}
          />
          <main className="view-enter min-w-0 w-full overflow-x-clip px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:px-8">
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
      <header className="border-b border-lotus-100 bg-white/90 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
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
