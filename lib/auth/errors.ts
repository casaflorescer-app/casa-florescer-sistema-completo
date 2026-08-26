type AuthLikeError = {
  message?: string;
  code?: string;
  status?: number;
} | null | undefined;

function textOf(error: AuthLikeError) {
  return `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
}

export function mapAuthError(error: unknown, fallback: string) {
  if (!error || typeof error !== "object") return fallback;
  const err = error as AuthLikeError;
  const text = textOf(err);

  if (err?.status === 429 || text.includes("rate") || text.includes("too many")) {
    return "Muitas tentativas. Aguarde um momento e tente de novo.";
  }
  if (text.includes("email not confirmed") || text.includes("email_not_confirmed")) {
    return "Confirme seu e-mail antes de entrar. Verifique a caixa de entrada.";
  }
  if (
    text.includes("invalid login") ||
    text.includes("invalid_credentials") ||
    text.includes("invalid_grant") ||
    text.includes("user not found") ||
    text.includes("user_not_found")
  ) {
    return "E-mail ou senha incorretos.";
  }
  if (text.includes("failed to fetch") || text.includes("network") || text.includes("fetch")) {
    return "Não foi possível conectar. Verifique sua internet e tente novamente.";
  }
  return fallback;
}

export function mapResetError(error: unknown) {
  return mapAuthError(error, "Não foi possível enviar o e-mail de recuperação.");
}
