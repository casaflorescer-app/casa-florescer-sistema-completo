import Link from "next/link";

const LINKS = [
  {
    href: "/app/admin/users",
    label: "Usuários",
    note: "Colaboradores e acessos da clínica.",
  },
  {
    href: "/app/admin/organization",
    label: "Organização",
    note: "Dados cadastrais da unidade.",
  },
  {
    href: "/app/admin/permissions",
    label: "Permissões",
    note: "Módulos de interface (não substituem membership clínico).",
  },
  {
    href: "/app/admin/audit",
    label: "Auditoria",
    note: "Trilha administrativa da clínica.",
  },
  {
    href: "/app/care-policies",
    label: "Política de atendimento",
    note: "Regras publicadas por profissional.",
  },
];

export default function ClinicAdminHomePage() {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">
        Administração da clínica
      </p>
      <h1 className="page-title mt-1">Administração</h1>
      <p className="page-sub mt-2">
        Usuários, organização, permissões e auditoria. Não é a administração técnica da plataforma.
      </p>
      <nav className="mt-6 grid gap-3 sm:grid-cols-2">
        {LINKS.map((item) => (
          <Link key={item.href} href={item.href} className="card block hover:border-lotus-200">
            <p className="font-semibold text-lotus-900">{item.label}</p>
            <p className="mt-1 text-sm text-lotus-600">{item.note}</p>
          </Link>
        ))}
      </nav>
    </div>
  );
}
