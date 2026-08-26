"use client";

import { BrandMark } from "./BrandMark";
import { RoleBadge } from "./RoleBadge";
import { SidebarNav } from "./SidebarNav";
import type { SessionContext } from "@/lib/types/domain";
import { signOutBrowser } from "@/lib/auth/sign-out";
import { useRouter } from "next/navigation";

async function exitSession(router: ReturnType<typeof useRouter>) {
  await signOutBrowser();
  router.replace("/login");
  router.refresh();
}

/** Shell autenticado. Menu por papel entra na FASE 6. */
export function AuthenticatedShell({
  session,
  children,
}: {
  session: SessionContext;
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-lotus-50">
      <header className="flex items-center justify-between border-b border-lotus-100 bg-white/80 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <BrandMark />
          {session.uiRole ? <RoleBadge role={session.uiRole} /> : null}
        </div>
        <div className="flex items-center gap-4">
          <p className="text-sm text-lotus-800">
            <span className="font-semibold">{session.fullName}</span>
          </p>
          <button
            type="button"
            onClick={() => void exitSession(router)}
            className="text-sm text-lotus-600 transition-colors hover:text-lotus-900"
          >
            Sair
          </button>
        </div>
      </header>
      {session.uiRole ? (
        <div className="lg:grid lg:grid-cols-[260px_1fr]">
          <aside className="border-b border-lotus-100 bg-white lg:sticky lg:top-0 lg:max-h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r">
            <SidebarNav />
          </aside>
          <main className="view-enter mx-auto w-full max-w-5xl flex-1 px-4 py-6">
            {children}
          </main>
        </div>
      ) : (
        <main className="view-enter mx-auto w-full max-w-5xl flex-1 px-4 py-6">
          {children}
        </main>
      )}
    </div>
  );
}

export function StaffShell({
  session,
  children,
}: {
  session: SessionContext;
  children: React.ReactNode;
}) {
  return <AuthenticatedShell session={session}>{children}</AuthenticatedShell>;
}
