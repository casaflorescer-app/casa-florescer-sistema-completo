/**
 * Converte erros técnicos em mensagem operacional para a UI.
 * C070-C4.3 — não exibir PostgREST / constraint / RPC cru.
 */
export function friendlyError(
  err: unknown,
  fallback = "Não foi possível concluir a operação. Tente novamente.",
): string {
  if (!(err instanceof Error) && typeof err !== "string") return fallback;
  const raw = (err instanceof Error ? err.message : err).trim();
  if (!raw) return fallback;

  const lower = raw.toLocaleLowerCase("pt-BR");
  if (
    lower.includes("foreign key") ||
    lower.includes("violates foreign key") ||
    lower.includes("still referenced")
  ) {
    return "Não foi possível concluir a operação porque este registro possui informações vinculadas.";
  }
  if (lower.includes("unique") || lower.includes("duplicate") || lower.includes("already exists")) {
    return "Já existe um registro com estes dados. Verifique e tente novamente.";
  }
  if (
    lower.includes("permission") ||
    lower.includes("row-level security") ||
    lower.includes("rls") ||
    lower.includes("not authorized") ||
    lower.includes("jwt")
  ) {
    return "Você não tem permissão para esta operação.";
  }
  if (
    lower.includes("rpc_error") ||
    lower.includes("postgrest") ||
    lower.includes("pgrst") ||
    lower.includes("constraint") ||
    lower.includes("sqlstate") ||
    lower.includes("stack")
  ) {
    return fallback;
  }
  // Mensagens já amigáveis (pt) passam direto; códigos técnicos viram fallback.
  if (/^[A-Z0-9_]+$/.test(raw) || raw.length > 280) return fallback;
  return raw;
}
