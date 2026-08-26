import { PREVIEW_ACL_COOKIE, PREVIEW_COOKIE, PREVIEW_USER_KEY } from "./rbac";
import type { ModuleId } from "./permissions";
import type { UiRole } from "./types/domain";

function readAcl(): Record<string, ModuleId[]> {
  try {
    const raw = localStorage.getItem(PREVIEW_ACL_COOKIE);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, ModuleId[]>;
  } catch {
    return {};
  }
}

export function readPreviewAclFromStorage(): Record<string, ModuleId[]> {
  if (typeof window === "undefined") return {};
  return readAcl();
}

export function readPreviewUserId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(PREVIEW_USER_KEY);
}

export function setPreviewUserId(_userId: string | null) {
  /* Preview não autentica mais. */
}

export async function setPreviewRole(_role: UiRole) {
  /* Preview não autentica mais. */
  return { ok: true as const };
}

export async function clearPreviewRole() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(PREVIEW_COOKIE);
    localStorage.removeItem(PREVIEW_USER_KEY);
  }
  return { ok: true as const };
}

/** ACL de tela mock (gestão de usuários). Não autoriza sessão. */
export async function setPreviewAcl(acl: Record<string, ModuleId[]>) {
  if (typeof window !== "undefined") {
    localStorage.setItem(PREVIEW_ACL_COOKIE, JSON.stringify(acl));
  }
  return { ok: true as const };
}
