export type ModuleId =
  | "agenda"
  | "pacientes"
  | "exames"
  | "prontuario"
  | "obstetrico"
  | "capacidade"
  | "estoque"
  | "auditoria"
  | "contratos"
  | "permissoes";

export type AppModule = {
  id: ModuleId;
  label: string;
  href: string;
  description: string;
};

export const APP_MODULES: AppModule[] = [
  { id: "agenda", label: "Agenda", href: "/secretaria/agenda", description: "Consultas do dia" },
  { id: "pacientes", label: "Cadastro de Paciente", href: "/secretaria/pacientes", description: "Ficha e contato" },
  { id: "exames", label: "Exames", href: "/secretaria/exames", description: "Solicitação e retirada" },
  { id: "prontuario", label: "Prontuário", href: "/medica/prontuario", description: "Histórico obstétrico" },
  { id: "obstetrico", label: "Programação obstétrica", href: "/medica", description: "Datas prováveis de parto" },
  { id: "capacidade", label: "Capacidade", href: "/medica/capacidade", description: "Teto diário" },
  { id: "estoque", label: "Estoque", href: "/gestao/estoque", description: "Casa inteira, por setor" },
  { id: "auditoria", label: "Auditoria", href: "/gestao/auditoria", description: "Conferência de estoque" },
  { id: "contratos", label: "Contratos e Sublocações", href: "/gestao/contratos", description: "Aluguel com água, luz e internet" },
  { id: "permissoes", label: "Usuários", href: "/gestao/usuarios", description: "Colaboradores e módulos" },
];

export const MODULE_IDS = APP_MODULES.map((item) => item.id);

const SECRETARY_DEFAULT: ModuleId[] = ["agenda", "pacientes", "exames"];
const PHYSICIAN_DEFAULT: ModuleId[] = [
  "obstetrico",
  "agenda",
  "pacientes",
  "exames",
  "prontuario",
  "capacidade",
];
const ADMIN_DEFAULT: ModuleId[] = [...MODULE_IDS];

export function defaultModulesForRole(
  role: "physician" | "secretary" | "manager" | "patient",
): ModuleId[] {
  if (role === "secretary") return [...SECRETARY_DEFAULT];
  if (role === "physician") return [...PHYSICIAN_DEFAULT];
  if (role === "manager") return [...ADMIN_DEFAULT];
  return [];
}

export function normalizeModules(value: unknown, fallback: ModuleId[]): ModuleId[] {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  const allowed = new Set<string>(MODULE_IDS);
  const unique: ModuleId[] = [];
  for (const item of value) {
    if (typeof item === "string" && allowed.has(item) && !unique.includes(item as ModuleId)) {
      unique.push(item as ModuleId);
    }
  }
  return unique.length > 0 ? unique : fallback;
}

export function modulesForSidebar(ids: ModuleId[]): AppModule[] {
  return APP_MODULES.filter((item) => ids.includes(item.id));
}

export function hasModule(ids: ModuleId[], id: ModuleId): boolean {
  return ids.includes(id);
}

export function moduleByPath(pathname: string): AppModule | undefined {
  const exact = APP_MODULES.find((item) => item.href === pathname);
  if (exact) return exact;
  return APP_MODULES.filter((item) => item.href !== "/medica")
    .filter((item) => pathname.startsWith(`${item.href}/`) || pathname === item.href)
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export function homeFromModules(ids: ModuleId[], fallback: string): string {
  const first = modulesForSidebar(ids)[0];
  return first?.href ?? fallback;
}
