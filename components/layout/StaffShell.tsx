"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BrandMark } from "./BrandMark";
import { RoleBadge } from "./RoleBadge";
import type { SessionContext } from "@/lib/types/domain";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { clearPreviewRole } from "@/lib/preview-api";
import { createClient } from "@/lib/supabase/client";

export function StaffShell({
  session,
  children,
}: {
  session: SessionContext;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { modules } = usePermissions();

  async function exitPreview() {
    await clearPreviewRole();
    const supabase = createClient();
    await supabase?.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-lotus-50 lg:grid lg:grid-cols-[220px_1fr]">
      <aside className="border-b border-lotus-100 bg-white lg:min-h-screen lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-4 lg:block">
          <BrandMark />
          <div className="lg:mt-4">
            <RoleBadge role={session.uiRole} />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible">
          {modules.map((item) => {
            const isOn =
              item.href === "/medica"
                ? pathname === "/medica"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm transition-colors duration-200 ${
                  isOn
                    ? "bg-lotus-700 text-white"
                    : "text-lotus-800 hover:bg-lotus-100"
                }`}
              >
                <span className="block font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
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
