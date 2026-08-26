export function cnpjDigits(value: string) {
  return value.replace(/\D/g, "").slice(0, 14);
}

export function isCnpjDigits(value: string) {
  return /^\d{14}$/.test(value);
}

export function formatCnpj(value: string) {
  const digits = cnpjDigits(value);
  if (digits.length !== 14) return digits;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR");
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR");
}

export function mapDbError(error: { code?: string; message?: string } | null) {
  if (!error) return "Não foi possível concluir a operação.";
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  if (error.code === "23505" || text.includes("duplicate") || text.includes("unique")) {
    return "Já existe um registro com este identificador (CNPJ ou e-mail).";
  }
  if (text.includes("row-level security") || text.includes("42501") || text.includes("permission")) {
    return "A política de acesso do banco recusou esta operação.";
  }
  if (error.message) return error.message;
  return "Não foi possível concluir a operação.";
}
