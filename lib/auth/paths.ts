/** Landing autenticada — superfície operacional oficial. */
export const AUTHENTICATED_HOME = "/app";

/** Portais legados (mock/protótipo). Isolados na B3.2 — código preservado. */
export const LEGACY_PORTAL_PREFIXES = [
  "/medica",
  "/secretaria",
  "/gestao",
  "/paciente",
] as const;

export const PUBLIC_PATHS = [
  "/",
  "/login",
  "/login/criar",
  "/login/esqueci-senha",
  "/auth/callback",
  "/auth/reset-password",
] as const;

function normalizePathname(pathname: string) {
  return pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

export function isPublicPath(pathname: string) {
  const path = normalizePathname(pathname);
  return PUBLIC_PATHS.some((item) => path === item || path.startsWith(`${item}/`));
}

export function isAuthEntryPath(pathname: string) {
  const path = normalizePathname(pathname);
  return path === "/login" || path === "/login/criar" || path === "/login/esqueci-senha";
}

export function isLegacyPortalPath(pathname: string) {
  const path = normalizePathname(pathname);
  return LEGACY_PORTAL_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/**
 * Destino pós-login seguro: path relativo interno, sem open redirect,
 * sem pousar em portais legados.
 */
export function resolveAuthenticatedPath(candidate: string | null | undefined) {
  if (!candidate) return AUTHENTICATED_HOME;
  if (!candidate.startsWith("/") || candidate.startsWith("//")) {
    return AUTHENTICATED_HOME;
  }
  const path = normalizePathname(candidate.split("?")[0] ?? candidate);
  if (isLegacyPortalPath(path)) return AUTHENTICATED_HOME;
  return path || AUTHENTICATED_HOME;
}
