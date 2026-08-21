import { PREVIEW_STAFF } from "@/lib/rbac";
import { defaultModulesForRole, type ModuleId } from "@/lib/permissions";
import type { UiRole } from "@/lib/types/domain";

export type DirectoryUser = {
  userId: string;
  fullName: string;
  email: string;
  uiRole: UiRole;
};

const USERS_KEY = "florescer_directory_users";
const ROLES_KEY = "florescer_directory_roles";

const SEED: DirectoryUser[] = [
  ...PREVIEW_STAFF,
  {
    userId: "preview-patient",
    fullName: "Marina Alves",
    email: "paciente@florescer.clinica",
    uiRole: "patient",
  },
];

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function listDirectoryUsers(): DirectoryUser[] {
  const extras = readJson<DirectoryUser[]>(USERS_KEY, []);
  const roles = readJson<Record<string, UiRole>>(ROLES_KEY, {});
  const byId = new Map<string, DirectoryUser>();
  for (const user of SEED) {
    byId.set(user.userId, { ...user, uiRole: roles[user.userId] ?? user.uiRole });
  }
  for (const user of extras) {
    byId.set(user.userId, { ...user, uiRole: roles[user.userId] ?? user.uiRole });
  }
  return [...byId.values()].sort((a, b) => a.fullName.localeCompare(b.fullName, "pt-BR"));
}

export function findDirectoryUserByEmail(email: string) {
  const needle = email.trim().toLowerCase();
  return listDirectoryUsers().find((user) => user.email.toLowerCase() === needle) ?? null;
}

export function createDirectoryUser(input: {
  fullName: string;
  email: string;
  uiRole: UiRole;
}): DirectoryUser | { error: string } {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  if (fullName.length < 3) return { error: "Informe o nome completo." };
  if (!email.includes("@")) return { error: "E-mail inválido." };
  if (findDirectoryUserByEmail(email)) return { error: "Já existe uma pessoa com este e-mail." };
  const user: DirectoryUser = {
    userId: `preview-custom-${crypto.randomUUID?.() ?? Date.now()}`,
    fullName,
    email,
    uiRole: input.uiRole,
  };
  const extras = readJson<DirectoryUser[]>(USERS_KEY, []);
  extras.push(user);
  localStorage.setItem(USERS_KEY, JSON.stringify(extras));
  return user;
}

export function updateDirectoryUserRole(userId: string, uiRole: UiRole) {
  const roles = readJson<Record<string, UiRole>>(ROLES_KEY, {});
  roles[userId] = uiRole;
  localStorage.setItem(ROLES_KEY, JSON.stringify(roles));
  const extras = readJson<DirectoryUser[]>(USERS_KEY, []);
  const next = extras.map((user) => (user.userId === userId ? { ...user, uiRole } : user));
  localStorage.setItem(USERS_KEY, JSON.stringify(next));
}

export function defaultAclForDirectory(): Record<string, ModuleId[]> {
  const acl: Record<string, ModuleId[]> = {};
  for (const user of listDirectoryUsers()) {
    acl[user.userId] = defaultModulesForRole(user.uiRole);
  }
  return acl;
}
