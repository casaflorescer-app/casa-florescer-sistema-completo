"use client";

import { Bell } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { BrandMark } from "@/components/layout/BrandMark";
import { PracticeSelector } from "@/components/layout/PracticeSelector";
import { isClinicStaff, uniqueStaffRoles } from "@/lib/auth/access";
import { roleLabels } from "@/lib/auth/app-nav";
import { useRouter } from "next/navigation";

function initials(name: string) {
  const clean = name.includes("@") ? name.split("@")[0] ?? name : name;
  const parts = clean.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const letters = parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
  return letters || "CF";
}

export function AppHeader({
  menuOpen,
  onMenuToggle,
  tone = "paper",
}: {
  menuOpen?: boolean;
  onMenuToggle: () => void;
  tone?: "paper" | "canvas";
}) {
  const { user, authorization, signOut } = useAuth();
  const router = useRouter();
  const displayName = authorization?.profile?.fullName || user?.fullName || user?.email || "Usuário";
  const orgName =
    authorization?.organization?.tradeName ?? authorization?.organization?.legalName ?? null;
  const roles = authorization ? uniqueStaffRoles(authorization) : [];

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header
      className={`sticky top-0 z-30 flex h-16 items-center justify-between gap-3 px-3 pt-[env(safe-area-inset-top)] ${
        tone === "canvas" ? "bg-transparent" : "bg-casa-mist/90 backdrop-blur"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className="min-h-11 min-w-11 shrink-0 rounded-xl border border-casa-plum/15 bg-white px-3 text-sm text-casa-plum lg:hidden"
          onClick={onMenuToggle}
          aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
          aria-expanded={menuOpen ?? false}
          aria-controls="app-sidebar"
        >
          Menu
        </button>
        <div className="lg:hidden">
          <BrandMark
            compact
            subtitle={
              authorization?.isSystemAdmin && authorization && !isClinicStaff(authorization)
                ? "Plataforma"
                : "Clínica"
            }
          />
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-casa-plum shadow-sm"
          aria-hidden
        >
          <Bell className="h-4 w-4" />
        </span>
        <div className="flex min-w-0 items-center gap-2 rounded-full bg-white py-1 pl-1 pr-3 shadow-sm">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-casa-plum text-[11px] font-semibold text-white" aria-hidden>
            {initials(displayName)}
          </span>
          <span className="hidden text-left sm:block">
            <span className="block text-[13px] font-semibold leading-4 text-casa-ink">{displayName}</span>
            <span className="block whitespace-nowrap text-[11px] leading-4 text-casa-ink/60">
              {roles.length ? roleLabels(roles) : orgName ?? "Casa Florescer"}
            </span>
          </span>
        </div>
        <span className={tone === "canvas" ? "[&_p]:text-white/85" : undefined}>
          <PracticeSelector />
        </span>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className={`min-h-11 shrink-0 px-2 text-sm transition-colors ${
            tone === "canvas" ? "text-white/85 hover:text-white" : "text-lotus-600 hover:text-lotus-900"
          }`}
        >
          Sair
        </button>
      </div>
    </header>
  );
}
