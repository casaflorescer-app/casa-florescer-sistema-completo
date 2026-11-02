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
}: {
  menuOpen?: boolean;
  onMenuToggle: () => void;
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
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-casa-mist/90 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
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
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-casa-plum shadow-sm"
          aria-hidden
        >
          <Bell className="h-5 w-5" />
        </span>
        <div className="flex min-w-0 items-center gap-3 rounded-full bg-white px-2 py-1.5 shadow-sm sm:px-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-casa-plum text-xs font-semibold text-white" aria-hidden>
            {initials(displayName)}
          </span>
          <span className="hidden min-w-0 text-left sm:block">
            <span className="block truncate text-sm font-semibold text-casa-ink">{displayName}</span>
            <span className="block truncate text-xs text-casa-ink/60">
              {roles.length ? roleLabels(roles) : orgName ?? "Casa Florescer"}
            </span>
          </span>
        </div>
        <PracticeSelector />
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="min-h-11 shrink-0 px-2 text-sm text-lotus-600 transition-colors hover:text-lotus-900"
        >
          Sair
        </button>
      </div>
    </header>
  );
}
