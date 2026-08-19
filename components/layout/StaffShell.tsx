"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BrandMark } from "./BrandMark";
import { RoleBadge } from "./RoleBadge";
import type { SessionContext } from "@/lib/types/domain";
import { NAV } from "@/lib/rbac";

export function StaffShell({
  session,
  children,
}: {
  session: SessionContext;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const items = NAV[session.uiRole];

  async function exitPreview() {
    await fetch("/api/preview-role", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-lotus-50 lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-lotus-100 bg-white lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-4 lg:block">
          <BrandMark />
          <div className="lg:mt-4">
            <RoleBadge role={session.uiRole} />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:px-3">
          {items.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== items[0].href && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm ${
                  active
                    ? "bg-lotus-700 text-white"
                    : "text-lotus-800 hover:bg-lotus-100"
                }`}
              >
                <span className="block font-medium">{item.label}</span>
                <span className={`hidden text-xs lg:block ${active ? "text-white/80" : "text-lotus-600"}`}>
                  {item.description}
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <div>
        <header className="flex items-center justify-between border-b border-lotus-100 bg-white/80 px-4 py-3 backdrop-blur">
          <p className="text-sm text-lotus-800">
            <span className="font-semibold">{session.fullName}</span>
            {session.isPreview ? (
              <span className="ml-2 text-lotus-500">prévia de interface</span>
            ) : null}
          </p>
          <button
            type="button"
            onClick={exitPreview}
            className="text-sm text-lotus-600 hover:text-lotus-900"
          >
            Sair
          </button>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </div>
    </div>
  );
}
