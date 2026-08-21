export function isStaticHosting() {
  return process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";
}

export function publicBasePath() {
  return process.env.NEXT_PUBLIC_BASE_PATH || "";
}

export function stripTrailingSlash(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}
