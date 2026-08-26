/** Landing autenticada provisória — FASE 2/3. RBAC entra na FASE 5/6. */
export const AUTHENTICATED_HOME = "/app";

export const PUBLIC_PATHS = [
  "/",
  "/login",
  "/login/criar",
  "/login/esqueci-senha",
  "/auth/callback",
  "/auth/reset-password",
] as const;

export function isPublicPath(pathname: string) {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return PUBLIC_PATHS.some((item) => path === item || path.startsWith(`${item}/`));
}

export function isAuthEntryPath(pathname: string) {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return path === "/login" || path === "/login/criar" || path === "/login/esqueci-senha";
}
