import { isStaticHosting } from "./hosting";
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

export function setPreviewUserId(userId: string | null) {
  if (typeof window === "undefined") return;
  if (userId) localStorage.setItem(PREVIEW_USER_KEY, userId);
  else localStorage.removeItem(PREVIEW_USER_KEY);
}

export async function setPreviewRole(role: UiRole) {
  if (isStaticHosting()) {
    localStorage.setItem(PREVIEW_COOKIE, role);
    return { ok: true as const };
  }
  const res = await fetch("/api/preview-role", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  return { ok: res.ok };
}

export async function clearPreviewRole() {
  if (isStaticHosting()) {
    localStorage.removeItem(PREVIEW_COOKIE);
    localStorage.removeItem(PREVIEW_USER_KEY);
    return { ok: true as const };
  }
  const res = await fetch("/api/preview-role", { method: "DELETE" });
  return { ok: res.ok };
}

export async function setPreviewAcl(acl: Record<string, ModuleId[]>) {
  if (isStaticHosting()) {
    localStorage.setItem(PREVIEW_ACL_COOKIE, JSON.stringify(acl));
    return { ok: true as const };
  }
  const res = await fetch("/api/preview-acl", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ acl }),
  });
  return { ok: res.ok };
}
