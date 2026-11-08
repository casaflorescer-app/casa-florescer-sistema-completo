import Link from "next/link";
import { AdminSubnav } from "@/components/clinic-admin/AdminSubnav";
import { PageHeader } from "@/components/ui/PageHeader";

const LINKS = [
  {
    href: "/app/admin/practices",
    label: "Práticas",
    note: "Práticas house da clínica (ex.: Samara e Thais).",
  },
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
    href: "/app/admin/integrations",
    label: "Integrações",
    note: "Chatwoot e administração WhatsApp (serviços externos).",
  },
  {
    href: "/app/care-policies",
    label: "Política de atendimento",
    note: "Regras publicadas por profissional.",
  },
  {
    href: "/app/admin/audit",
    label: "Auditoria",
    note: "Trilha administrativa da clínica.",
  },
];

export default function ClinicAdminHomePage() {
  return (
    <div>
      <PageHeader
        eyebrow="Administração da clínica"
        title="Administração"
        description="Usuários, organização, permissões, integrações e auditoria da Casa Florescer. Distinta da administração técnica da plataforma."
      />
      <div className="mt-4">
        <AdminSubnav active="hub" />
      </div>
      <nav className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LINKS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="card block transition-colors hover:border-lotus-200"
          >
            <p className="font-semibold text-lotus-900">{item.label}</p>
            <p className="mt-1 text-sm text-lotus-600">{item.note}</p>
            <p className="mt-3 text-sm font-medium text-lotus-800">Abrir →</p>
          </Link>
        ))}
      </nav>
    </div>
  );
}
