"use client";

export const WORKSPACE_SECTIONS = [
  { id: "resumo", label: "Resumo" },
  { id: "historico", label: "Histórico" },
  { id: "atendimento", label: "Atendimento" },
  { id: "gravacao", label: "Gravação" },
  { id: "exames", label: "Exames" },
  { id: "receita", label: "Receita" },
  { id: "orientacao", label: "Orientação" },
  { id: "retorno", label: "Retorno" },
  { id: "encerramento", label: "Encerramento" },
] as const;

export type WorkspaceSectionId = (typeof WORKSPACE_SECTIONS)[number]["id"];

export function WorkspaceSectionNav({ activeId }: { activeId?: string }) {
  return (
    <nav
      aria-label="Seções do prontuário"
      className="sticky top-0 z-20 -mx-1 overflow-x-auto bg-[#FFF8F5]/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-[#FFF8F5]/80"
    >
      <ul className="flex min-w-max gap-1.5">
        {WORKSPACE_SECTIONS.map((section) => {
          const active = activeId === section.id;
          return (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "border-[#B76E79] bg-[#B76E79] text-white"
                    : "border-lotus-200 bg-white text-lotus-800 hover:border-lotus-300"
                }`}
              >
                {section.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
