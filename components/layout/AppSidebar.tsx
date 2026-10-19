"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { NavItem } from "@/components/layout/NavItem";
import type { AppNavSection } from "@/lib/auth/app-nav";

export function AppSidebar({
  sections,
  open,
  onNavigate,
  onClose,
}: {
  sections: AppNavSection[];
  open: boolean;
  onNavigate: () => void;
  onClose?: () => void;
}) {
  const pathname = usePathname() || "/app";
  const [isLarge, setIsLarge] = useState(false);
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsLarge(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const exposed = isLarge || open;

  useEffect(() => {
    const el = asideRef.current;
    if (!el) return;
    if (exposed) el.removeAttribute("inert");
    else el.setAttribute("inert", "");
  }, [exposed]);

  return (
    <aside
      ref={asideRef}
      id="app-sidebar"
      aria-hidden={exposed ? undefined : true}
      className={`fixed inset-y-0 left-0 z-50 flex w-[min(18rem,88vw)] flex-col border-r border-lotus-100 bg-white shadow-lg transition-transform duration-200 ease-out lg:static lg:z-auto lg:max-h-[calc(100vh-4.25rem)] lg:w-auto lg:translate-x-0 lg:shadow-none lg:sticky lg:top-[4.25rem] lg:overflow-y-auto lg:border-b-0 ${
        open ? "translate-x-0" : "-translate-x-full pointer-events-none lg:pointer-events-auto lg:translate-x-0"
      }`}
      style={{
        paddingTop: "max(0px, env(safe-area-inset-top))",
        paddingBottom: "max(0px, env(safe-area-inset-bottom))",
      }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-lotus-50 px-3 py-3 lg:hidden">
        <p className="text-sm font-semibold text-lotus-900">Navegação</p>
        <button
          type="button"
          className="min-h-11 min-w-11 rounded-lg border border-lotus-100 px-3 text-sm text-lotus-800"
          onClick={onClose}
          aria-label="Fechar menu"
        >
          Fechar
        </button>
      </div>
      <nav className="flex flex-col gap-5 overflow-y-auto px-3 py-4" aria-label="Navegação principal">
        {sections.map((section) => (
          <div key={section.id}>
            <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-lotus-500">
              {section.title}
            </p>
            <ul className="mt-2 space-y-0.5">
              {section.items.map((item) => {
                const isHub =
                  item.href === "/app" ||
                  item.href === "/app/system" ||
                  item.href === "/app/admin" ||
                  item.href === "/app/dashboard";
                const active = isHub
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.id}>
                    <NavItem
                      href={item.href}
                      label={item.label}
                      active={active}
                      onNavigate={onNavigate}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
