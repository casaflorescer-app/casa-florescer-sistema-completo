/** Persistência monetária em centavos (inteiro). Não usar float no banco. */

export function formatCentsBRL(cents: number): string {
  if (!Number.isFinite(cents) || !Number.isInteger(cents)) return "—";
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function parseReaisToCents(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let normalized: string;
  if (trimmed.includes(",")) {
    normalized = trimmed.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(trimmed)) {
    normalized = trimmed.replace(/\./g, "");
  } else {
    normalized = trimmed.replace(/\s/g, "");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  if (!Number.isInteger(cents) || cents < 0) return null;
  return cents;
}

export function centsToReaisInput(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) return "";
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, "0");
  return `${whole},${fraction}`;
}
