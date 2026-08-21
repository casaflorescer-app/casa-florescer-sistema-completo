"use client";

import { BrandMark } from "./BrandMark";
import { RoleBadge } from "./RoleBadge";
import { SidebarNav } from "./SidebarNav";
import type { SessionContext } from "@/lib/types/domain";
import { clearPreviewRole } from "@/lib/preview-api";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function StaffShell({
  session,
  children,
}: {
  session: SessionContext;
  children: React.ReactNode;
}) {
  const router = useRouter();

  async function exitPreview() {
    await clearPreviewRole();
    const supabase = createClient();
    await supabase?.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-lotus-50 lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="border-b border-lotus-100 bg-white lg:sticky lg:top-0 lg:max-h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-4 lg:block">
          <BrandMark />
          <div className="lg:mt-4">
            <RoleBadge role={session.uiRole} />
          </div>
        </div>
        <SidebarNav />
      </aside>
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between border-b border-lotus-100 bg-white/80 px-4 py-3 backdrop-blur">
          <p className="text-sm text-lotus-800">
            <span className="font-semibold">{session.fullName}</span>
          </p>
          <button
            type="button"
            onClick={exitPreview}
            className="text-sm text-lotus-600 transition-colors hover:text-lotus-900"
          >
            Sair
          </button>
        </header>
        <main className="view-enter mx-auto w-full max-w-5xl flex-1 px-4 py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
