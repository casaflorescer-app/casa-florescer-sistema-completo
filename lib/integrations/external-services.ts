/**
 * C070-C8 — URLs de serviços externos (atalhos; não são credenciais).
 * Override via NEXT_PUBLIC_* no build/deploy; fallbacks = URLs oficiais da clínica.
 */

const DEFAULT_CHATWOOT_URL =
  "https://cap-romao-chatwoot.cr49ek.easypanel.host?utm_source=chatgpt.com";

const DEFAULT_EVOLUTION_MANAGER_URL =
  "https://cap-romao-evolution-api.cr49ek.easypanel.host/manager?utm_source=chatgpt.com";

function readPublicUrl(envName: string, fallback: string): string {
  const raw = process.env[envName]?.trim();
  if (!raw) return fallback;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return fallback;
    return raw;
  } catch {
    return fallback;
  }
}

export function getChatwootUrl(): string {
  return readPublicUrl("NEXT_PUBLIC_CHATWOOT_URL", DEFAULT_CHATWOOT_URL);
}

export function getEvolutionManagerUrl(): string {
  return readPublicUrl("NEXT_PUBLIC_EVOLUTION_MANAGER_URL", DEFAULT_EVOLUTION_MANAGER_URL);
}

export const EXTERNAL_SERVICE_DEFAULTS = {
  chatwoot: DEFAULT_CHATWOOT_URL,
  evolutionManager: DEFAULT_EVOLUTION_MANAGER_URL,
} as const;
