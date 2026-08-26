"use client";

import { usePathname } from "next/navigation";
import { NavItem } from "@/components/layout/NavItem";
import type { AppNavSection } from "@/lib/auth/app-nav";

export function AppSidebar({
  sections,
  open,
  onNavigate,
}: {
  sections: AppNavSection[];
  open: boolean;
  onNavigate: () => void;
}) {
  const pathname = usePathname() || "/app";

  return (
    <aside
      className={`${
        open ? "block" : "hidden"
      } border-b border-lotus-100 bg-white lg:sticky lg:top-0 lg:block lg:max-h-[calc(100vh-4.25rem)] lg:overflow-y-auto lg:border-b-0 lg:border-r`}
    >
      <nav className="flex flex-col gap-5 px-3 py-4" aria-label="Navegação principal">
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
