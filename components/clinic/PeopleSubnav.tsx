import Link from "next/link";

const ITEMS = [
  { id: "hub", label: "Visão geral", href: "/app/people" },
  { id: "professionals", label: "Profissionais", href: "/app/professionals" },
  { id: "specialties", label: "Especialidades", href: "/app/specialties" },
  { id: "workforce", label: "Funcionários", href: "/app/workforce" },
] as const;

export type PeopleSubnavId = (typeof ITEMS)[number]["id"];

/**
 * Subnavegação do hub Pessoas.
 * Profissionais ≠ Funcionários (assistencial × operação/RH).
 */
export function PeopleSubnav({ active }: { active: PeopleSubnavId }) {
  return (
    <nav className="mb-4 flex flex-wrap gap-2" aria-label="Pessoas">
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
