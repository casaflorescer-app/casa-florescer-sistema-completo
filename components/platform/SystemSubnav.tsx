import Link from "next/link";

const ITEMS = [
  { id: "hub", label: "Visão geral", href: "/app/system" },
  { id: "organizations", label: "Organizações", href: "/app/system/organizations" },
  { id: "users", label: "Usuários", href: "/app/system/users" },
  { id: "audit", label: "Auditoria técnica", href: "/app/system/audit" },
] as const;

export type SystemSubnavId = (typeof ITEMS)[number]["id"];

/** Subnavegação do hub Plataforma (SYSTEM_ADMIN). */
export function SystemSubnav({ active }: { active: SystemSubnavId }) {
  return (
    <nav className="mb-4 flex flex-wrap gap-2" aria-label="Plataforma">
      {ITEMS.map((item) => {
        const isActive = item.id === active;
        return (
          <Link
            key={item.id}
            href={item.href}
            className={
              isActive
                ? "rounded-xl bg-lotus-700 px-3 py-1.5 text-sm font-semibold text-white"
                : "rounded-xl border border-lotus-200 bg-white px-3 py-1.5 text-sm font-medium text-lotus-800 hover:border-lotus-300"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
