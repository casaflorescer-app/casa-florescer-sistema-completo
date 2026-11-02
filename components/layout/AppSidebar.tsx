"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  Baby,
  BarChart3,
  Boxes,
  Building2,
  CalendarDays,
  DoorOpen,
  FileText,
  FlaskConical,
  FolderOpen,
  HeartHandshake,
  LayoutDashboard,
  MessageCircle,
  Pill,
  Settings,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { BrandMark } from "@/components/layout/BrandMark";
import { publicAsset } from "@/lib/hosting";
import { NavItem } from "@/components/layout/NavItem";
import type { AppNavSection } from "@/lib/auth/app-nav";

const NAV_ICONS: Record<string, ReactNode> = {
  overview: <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden />,
  agenda: <CalendarDays className="h-4 w-4 shrink-0" aria-hidden />,
  patients: <Users className="h-4 w-4 shrink-0" aria-hidden />,
  records: <FolderOpen className="h-4 w-4 shrink-0" aria-hidden />,
  obstetrics: <Baby className="h-4 w-4 shrink-0" aria-hidden />,
  exams: <FlaskConical className="h-4 w-4 shrink-0" aria-hidden />,
  prescriptions: <Pill className="h-4 w-4 shrink-0" aria-hidden />,
  "relationship-central": <HeartHandshake className="h-4 w-4 shrink-0" aria-hidden />,
  "relationship-chatwoot": <MessageCircle className="h-4 w-4 shrink-0" aria-hidden />,
  rooms: <DoorOpen className="h-4 w-4 shrink-0" aria-hidden />,
  "clinical-contracts": <FileText className="h-4 w-4 shrink-0" aria-hidden />,
  people: <UserRound className="h-4 w-4 shrink-0" aria-hidden />,
  inventory: <Boxes className="h-4 w-4 shrink-0" aria-hidden />,
  reports: <BarChart3 className="h-4 w-4 shrink-0" aria-hidden />,
  finance: <Wallet className="h-4 w-4 shrink-0" aria-hidden />,
  "clinic-admin": <Settings className="h-4 w-4 shrink-0" aria-hidden />,
  portal: <UserRound className="h-4 w-4 shrink-0" aria-hidden />,
  "system-home": <Building2 className="h-4 w-4 shrink-0" aria-hidden />,
};

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
      className={`fixed inset-y-0 left-0 z-50 flex w-[min(18rem,88vw)] flex-col bg-casa-plum text-white shadow-lg transition-transform duration-200 ease-out lg:static lg:z-auto lg:h-screen lg:w-[204px] lg:translate-x-0 lg:shadow-none lg:sticky lg:top-0 lg:overflow-y-auto ${
        open ? "translate-x-0" : "-translate-x-full pointer-events-none lg:pointer-events-auto lg:translate-x-0"
      }`}
      style={{
        paddingTop: "max(0px, env(safe-area-inset-top))",
        paddingBottom: "max(0px, env(safe-area-inset-bottom))",
      }}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-4">
        <div className="min-w-0 flex-1">
          <BrandMark stacked tone="light" subtitle="Ginecologia e Obstetrícia" />
        </div>
        <button
          type="button"
          className="min-h-11 min-w-11 rounded-lg border border-white/20 px-3 text-sm text-white lg:hidden"
          onClick={onClose}
          aria-label="Fechar menu"
        >
          Fechar
        </button>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 pb-4" aria-label="Navegação principal">
        {sections.map((section) => (
          <div key={section.id}>
            <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
              {section.title}
            </p>
            <ul className="mt-2 space-y-0.5">
              {section.items.map((item) => {
                const isExternal = Boolean(item.external);
                const isHub =
                  item.href === "/app" ||
                  item.href === "/app/system" ||
                  item.href === "/app/admin" ||
                  item.href === "/app/people" ||
                  item.href === "/app/dashboard";
                // Hubs: ativo na página do hub; filhos usam subnav (não destacam o hub por prefixo).
                // Exceção: pessoas/admin/system — destacar hub também em subrotas conhecidas.
                const peopleActive =
                  item.href === "/app/people" &&
                  (pathname === "/app/people" ||
                    pathname.startsWith("/app/professionals") ||
                    pathname.startsWith("/app/specialties") ||
                    pathname.startsWith("/app/workforce"));
                const adminActive =
                  item.href === "/app/admin" &&
                  (pathname === "/app/admin" ||
                    pathname.startsWith("/app/admin/") ||
                    pathname.startsWith("/app/care-policies"));
                const systemActive =
                  item.href === "/app/system" &&
                  (pathname === "/app/system" || pathname.startsWith("/app/system/"));
                const active = isExternal
                  ? false
                  : peopleActive
                    ? true
                    : adminActive
                      ? true
                      : systemActive
                        ? true
                        : isHub
                          ? pathname === item.href
                          : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.id}>
                    <NavItem
                      href={item.href}
                      label={item.label}
                      active={active}
                      external={isExternal}
                      onNavigate={onNavigate}
                      tone="plum"
                      icon={NAV_ICONS[item.id]}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <SidebarBloom />
    </aside>
  );
}

function SidebarBloom() {
  return (
    <img
      src={publicAsset("/brand/gestante-contorno.png")}
      alt=""
      width={324}
      height={548}
      className="pointer-events-none mt-auto h-56 w-full shrink-0 object-contain object-bottom"
      aria-hidden
    />
  );
}
