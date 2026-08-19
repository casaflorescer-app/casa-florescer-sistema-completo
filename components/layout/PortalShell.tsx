"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BrandMark } from "./BrandMark";
import type { SessionContext } from "@/lib/types/domain";
import { NAV } from "@/lib/rbac";

export function PortalShell({
  session,
  children,
}: {
  session: SessionContext;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const items = NAV.patient;

  async function exitPreview() {
    await fetch("/api/preview-role", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-lotus-50">
      <header className="flex items-center justify-between px-4 pb-2 pt-5">
        <BrandMark />
        <button type="button" onClick={exitPreview} className="text-sm text-lotus-600">
          Sair
        </button>
      </header>
      <p className="px-4 text-sm text-lotus-700">
        Olá, <strong>{session.fullName.split(" ")[0]}</strong>. Tudo o que você precisa
        está aqui — sem ligar para a recepção.
      </p>
      <nav className="mt-4 grid grid-cols-4 gap-1 px-3">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-2xl px-2 py-3 text-center text-xs font-medium ${
                active ? "bg-lotus-700 text-white" : "bg-white text-lotus-800"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <main className="px-4 py-5">{children}</main>
    </div>
  );
}
