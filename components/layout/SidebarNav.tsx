"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon } from "@/components/icons/NavIcons";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { isNavItemActive } from "@/lib/nav";

export function SidebarNav() {
  const pathname = usePathname() || "/";
  const { navSections } = usePermissions();

  return (
    <nav className="flex flex-col gap-5 px-3 pb-4">
      {navSections.map((section) => (
        <div key={section.id}>
          <p className="px-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
            {section.title}
          </p>
          <ul className="mt-2 space-y-0.5">
            {section.items.map((item) => {
              const active = isNavItemActive(pathname, item);
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-l-xl px-3 py-2 text-sm transition-colors duration-200 ${
                      active
                        ? "border-r-4 border-rose-500 bg-rose-50 font-medium text-rose-900"
                        : "border-r-4 border-transparent text-gray-600 hover:bg-rose-50/80 hover:text-rose-900"
                    }`}
                  >
                    <NavIcon name={item.icon} className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
