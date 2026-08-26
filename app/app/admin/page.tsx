import Link from "next/link";

const LINKS = [
  { href: "/app/admin/users", label: "Usuários" },
  { href: "/app/admin/organization", label: "Organização" },
  { href: "/app/admin/permissions", label: "Permissões" },
  { href: "/app/admin/audit", label: "Auditoria" },
  { href: "/app/admin/settings", label: "Configurações da clínica" },
];

export default function ClinicAdminHomePage() {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">
        Administração da clínica
      </p>
      <h1 className="page-title mt-1">Gestão da clínica</h1>
      <p className="page-sub mt-2">
        Área de OWNER e ADMIN. Não é a administração técnica da plataforma.
      </p>
      <nav className="mt-6 grid gap-3 sm:grid-cols-2">
        {LINKS.map((item) => (
          <Link key={item.href} href={item.href} className="card block hover:border-lotus-200">
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
