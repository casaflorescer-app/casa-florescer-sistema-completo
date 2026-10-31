import Link from "next/link";
import { PeopleSubnav } from "@/components/clinic/PeopleSubnav";

const CARDS = [
  {
    href: "/app/professionals",
    title: "Profissionais",
    note: "Médicas, enfermeiras e demais profissionais assistenciais. Distintos de funcionários e prestadores.",
    action: "Gerenciar profissionais",
  },
  {
    href: "/app/specialties",
    title: "Especialidades",
    note: "Especialidades e áreas de atuação usadas pela clínica e pelos profissionais.",
    action: "Gerenciar especialidades",
  },
  {
    href: "/app/workforce",
    title: "Funcionários",
    note: "Funcionários e prestadores da operação da clínica (secretaria, serviços e demais cargos). Não são profissionais de saúde.",
    action: "Gerenciar funcionários",
  },
] as const;

export function PeopleHub() {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">Gestão</p>
      <h1 className="page-title mt-1">Pessoas</h1>
      <p className="page-sub mt-2 max-w-2xl">
        Cadastros de quem atua na Casa Florescer. Profissionais de saúde e funcionários/prestadores
        permanecem em cadastros separados.
      </p>

      <div className="mt-4">
        <PeopleSubnav active="hub" />
      </div>

      <nav className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Áreas de Pessoas">
        {CARDS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="card block transition-colors hover:border-lotus-200"
          >
            <p className="font-semibold text-lotus-900">{item.title}</p>
            <p className="mt-1 text-sm text-lotus-600">{item.note}</p>
            <p className="mt-3 text-sm font-medium text-lotus-800">{item.action} →</p>
          </Link>
        ))}
      </nav>
    </div>
  );
}
