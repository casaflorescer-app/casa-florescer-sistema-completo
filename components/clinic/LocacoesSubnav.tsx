import Link from "next/link";

const ITEMS = [
  { id: "salas", label: "Salas", href: "/app/rooms" },
  { id: "alugueis", label: "Locações", href: "/app/rentals" },
  { id: "contratos", label: "Contratos", href: "/app/rentals?tab=contracts" },
] as const;

export type LocacoesSubnavId = (typeof ITEMS)[number]["id"];

/**
 * Subnavegação do ecossistema Sala → aluguel → contrato de locação.
 * Não mistura contratos clínicos.
 */
export function LocacoesSubnav({ active }: { active: LocacoesSubnavId }) {
  return (
    <nav className="mt-4 flex flex-wrap gap-2" aria-label="Salas e locações">
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
