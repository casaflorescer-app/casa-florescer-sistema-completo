import Link from "next/link";

const ITEMS = [
  { id: "hub", label: "Visão geral", href: "/app/admin" },
  { id: "users", label: "Usuários", href: "/app/admin/users" },
  { id: "organization", label: "Organização", href: "/app/admin/organization" },
  { id: "permissions", label: "Permissões", href: "/app/admin/permissions" },
  { id: "integrations", label: "Integrações", href: "/app/admin/integrations" },
  { id: "policies", label: "Política de atendimento", href: "/app/care-policies" },
  { id: "audit", label: "Auditoria", href: "/app/admin/audit" },
] as const;

export type AdminSubnavId = (typeof ITEMS)[number]["id"];

/** Subnavegação do hub Administração da clínica. */
export function AdminSubnav({ active }: { active: AdminSubnavId }) {
  return (
    <nav className="mb-4 flex flex-wrap gap-2" aria-label="Administração da clínica">
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
