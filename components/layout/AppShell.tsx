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
      <div className="min-h-screen bg-casa-mist text-casa-ink lg:grid lg:grid-cols-[204px_minmax(0,1fr)]">
        {menuOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-casa-ink/40 lg:hidden"
            aria-label="Fechar menu"
            onClick={() => setMenuOpen(false)}
          />
        ) : null}
        <AppSidebar
          sections={sections}
          open={menuOpen}
          onNavigate={() => setMenuOpen(false)}
          onClose={() => setMenuOpen(false)}
        />
        <div className="min-w-0">
          <AppHeader
            menuOpen={menuOpen}
            onMenuToggle={() => setMenuOpen((open) => !open)}
          />
          <main className="view-enter min-w-0 w-full overflow-x-clip px-3 py-3 pb-[max(1rem,env(safe-area-inset-bottom))] lg:px-3.5">
            {children}
          </main>
        </div>
      </div>
    </PracticeUiProvider>
  );
}

export function AppLoadingShell({ message = "Carregando acesso…" }: { message?: string }) {
  return (
    <div className="min-h-screen bg-casa-mist text-casa-ink lg:grid lg:grid-cols-[204px_minmax(0,1fr)]">
      <aside className="hidden bg-casa-plum lg:block" aria-hidden>
        <p className="px-4 py-5 text-sm font-semibold uppercase tracking-[0.16em] text-white">
          Casa Florescer
        </p>
      </aside>
      <div>
        <header className="border-b border-white/40 bg-white/80 px-4 py-3">
          <p className="text-sm font-semibold text-casa-plum">Casa Florescer</p>
        </header>
        <main className="px-4 py-6 lg:px-8" aria-busy="true">
          <p className="text-sm text-casa-ink/70">{message}</p>
          <div className="mt-6 h-48 animate-pulse rounded-3xl bg-white/80" />
        </main>
      </div>
    </div>
  );
}
