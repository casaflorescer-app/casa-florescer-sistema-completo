import { hasModule, isMasterAdminRole, type ModuleId } from "@/lib/permissions";
import type { UiRole } from "@/lib/types/domain";
import { stripTrailingSlash } from "@/lib/hosting";

export type NavIconName =
  | "calendar-clock"
  | "folder-open"
  | "users"
  | "gauge"
  | "calendar-days"
  | "user-plus"
  | "list-todo"
  | "flask-conical"
  | "megaphone"
  | "layout-dashboard"
  | "file-signature"
  | "package"
  | "shield-check"
  | "calendar-check"
  | "files"
  | "user-pen";

export type SidebarLink = {
  id: string;
  label: string;
  href: string;
  icon: NavIconName;
  /** Exige ao menos um destes módulos no ACL do usuário. */
  moduleIds?: ModuleId[];
  /** Marca o item ativo também nestes caminhos (ex.: programação obstétrica). */
  aliases?: string[];
};

export type SidebarSection = {
  id: "medico" | "secretaria" | "gestao" | "paciente";
  title: string;
  roles: UiRole[];
  items: SidebarLink[];
};

/**
 * Fonte única do menu lateral. Para incluir um link no futuro, acrescente
 * um item na seção correspondente (e, se for o caso, o `moduleId` no ACL).
 */
export const SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    id: "medico",
    title: "Módulo Médico",
    roles: ["physician"],
    items: [
      {
        id: "med-agenda",
        label: "Minha Agenda",
        href: "/app/agenda",
        icon: "calendar-clock",
        moduleIds: ["agenda", "obstetrico"],
        aliases: ["/app/obstetrics"],
      },
      {
        id: "med-prontuario",
        label: "Prontuários Eletrônicos",
        href: "/app/records",
        icon: "folder-open",
        moduleIds: ["prontuario"],
      },
      {
        id: "med-pacientes",
        label: "Meus Pacientes",
        href: "/app/patients",
        icon: "users",
        moduleIds: ["pacientes"],
      },
      {
        id: "med-limites",
        label: "Configuração de Limites",
        href: "/app",
        icon: "gauge",
        moduleIds: ["capacidade"],
      },
    ],
  },
  {
    id: "secretaria",
    title: "Módulo Secretaria",
    roles: ["secretary"],
    items: [
      {
        id: "sec-agenda",
        label: "Agenda Geral",
        href: "/app/agenda",
        icon: "calendar-days",
        moduleIds: ["agenda"],
      },
      {
        id: "sec-pacientes",
        label: "Cadastro de Pacientes",
        href: "/app/patients",
        icon: "user-plus",
        moduleIds: ["pacientes"],
      },
      {
        id: "sec-fila",
        label: "Fila de Espera / Reagendamento",
        href: "/app/agenda",
        icon: "list-todo",
        moduleIds: ["agenda"],
      },
      {
        id: "sec-exames",
        label: "Gestão de Exames",
        href: "/app/exams",
        icon: "flask-conical",
        moduleIds: ["exames"],
      },
      {
        id: "sec-mural",
        label: "Mural de Avisos / Lembretes",
        href: "/app",
        icon: "megaphone",
        moduleIds: ["agenda"],
      },
    ],
  },
  {
    id: "gestao",
    title: "Módulo Gestão",
    roles: ["manager"],
    items: [
      {
        id: "ges-dashboard",
        label: "Dashboard e Auditoria",
        href: "/app/admin/audit",
        icon: "layout-dashboard",
        moduleIds: ["auditoria"],
      },
      {
        id: "ges-contratos",
        label: "Contratos e Sublocações",
        href: "/app/rentals",
        icon: "file-signature",
        moduleIds: ["contratos"],
      },
      {
        id: "ges-estoque",
        label: "Controle de Estoque",
        href: "/app/inventory",
        icon: "package",
        moduleIds: ["estoque"],
      },
      {
        id: "ges-usuarios",
        label: "Gestão de Usuários e Permissões",
        href: "/app/admin/users",
        icon: "shield-check",
        moduleIds: ["permissoes"],
        aliases: ["/app/admin/permissions"],
      },
    ],
  },
  {
    id: "paciente",
    title: "Módulo Paciente",
    roles: ["patient"],
    items: [
      {
        id: "pac-agenda",
        label: "Meus Agendamentos",
        href: "/app/portal",
        icon: "calendar-check",
        aliases: ["/app"],
      },
      {
        id: "pac-exames",
        label: "Meus Exames",
        href: "/app/portal",
        icon: "files",
      },
      {
        id: "pac-cadastro",
        label: "Atualizar Cadastro",
        href: "/app/portal",
        icon: "user-pen",
      },
    ],
  },
];

function linkAllowed(item: SidebarLink, role: UiRole, permissions: ModuleId[]) {
  if (isMasterAdminRole(role)) return true;
  if (!item.moduleIds || item.moduleIds.length === 0) return true;
  return item.moduleIds.some((id) => hasModule(permissions, id));
}

function pathMatches(pathname: string, href: string) {
  const path = stripTrailingSlash(pathname);
  const target = stripTrailingSlash(href);
  return path === target || path.startsWith(`${target}/`);
}

const ADMIN_SECTION_ORDER: SidebarSection["id"][] = [
  "gestao",
  "medico",
  "secretaria",
  "paciente",
];

export function navSectionsFor(
  role: UiRole | null,
  permissions: ModuleId[],
): SidebarSection[] {
  if (!role) return [];
  if (isMasterAdminRole(role)) {
    const byId = new Map(SIDEBAR_SECTIONS.map((section) => [section.id, section]));
    return ADMIN_SECTION_ORDER.map((id) => {
      const section = byId.get(id)!;
      return { ...section, items: [...section.items] };
    });
  }
  return SIDEBAR_SECTIONS.filter((section) => section.roles.includes(role))
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => linkAllowed(item, role, permissions)),
    }))
    .filter((section) => section.items.length > 0);
}

export function isNavItemActive(pathname: string, item: SidebarLink) {
  if (pathMatches(pathname, item.href)) return true;
  const path = stripTrailingSlash(pathname);
  return (item.aliases ?? []).some((alias) => path === stripTrailingSlash(alias));
}

export function firstSidebarHref(role: UiRole | null, permissions: ModuleId[]) {
  return navSectionsFor(role, permissions)[0]?.items[0]?.href;
}
