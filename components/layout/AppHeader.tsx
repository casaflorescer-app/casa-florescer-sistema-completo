"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { BrandMark } from "@/components/layout/BrandMark";
import { PracticeSelector } from "@/components/layout/PracticeSelector";
import { isClinicStaff, uniqueStaffRoles } from "@/lib/auth/access";
import { roleLabels } from "@/lib/auth/app-nav";
import { useRouter } from "next/navigation";

export function AppHeader({ onMenuToggle }: { onMenuToggle: () => void }) {
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
    <header className="flex items-center justify-between gap-3 border-b border-lotus-100 bg-white/90 px-4 py-3 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className="rounded-lg border border-lotus-100 px-2 py-1 text-sm text-lotus-800 lg:hidden"
          onClick={onMenuToggle}
          aria-label="Abrir menu"
        >
          Menu
        </button>
        <BrandMark
          subtitle={
            authorization?.isSystemAdmin && authorization && !isClinicStaff(authorization)
              ? "Plataforma"
              : "Clínica"
          }
        />
      </div>

      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <div className="hidden min-w-0 text-right sm:block">
          <p className="truncate text-sm font-semibold text-lotus-900">{displayName}</p>
          <p className="truncate text-xs text-lotus-600">
            {orgName ?? "Casa Florescer"}
            {authorization?.isSystemAdmin ? " · Administração da plataforma" : ""}
            {roles.length ? ` · ${roleLabels(roles)}` : ""}
          </p>
        </div>
        <PracticeSelector />
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="shrink-0 text-sm text-lotus-600 transition-colors hover:text-lotus-900"
        >
          Sair
        </button>
      </div>
    </header>
  );
}
