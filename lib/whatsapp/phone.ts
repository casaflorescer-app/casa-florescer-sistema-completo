/**
 * Normalização de telefone apenas para abertura do WhatsApp Web.
 * NÃO altera o valor persistido no banco.
 */

export type WhatsAppPhoneResult =
  | { ok: true; e164Digits: string; displayHint: string }
  | { ok: false; reason: "empty" | "invalid" };

/** Remove tudo que não for dígito. */
export function digitsOnly(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

/**
 * Normaliza para dígitos internacionais sem "+" (ex.: 5518999999999).
 * Brasil: assume +55 quando o número tem 10–11 dígitos (DDD + local).
 * Evita duplicar 55 se já estiver presente.
 */
export function normalizePhoneForWhatsApp(
  raw: string | null | undefined,
  options?: { defaultCountry?: "BR" },
): WhatsAppPhoneResult {
  const defaultCountry = options?.defaultCountry ?? "BR";
  const digits = digitsOnly(raw);
  if (!digits) return { ok: false, reason: "empty" };

  let e164 = digits;

  if (defaultCountry === "BR") {
    if (e164.startsWith("55") && (e164.length === 12 || e164.length === 13)) {
      // já com país
    } else if (e164.length === 10 || e164.length === 11) {
      e164 = `55${e164}`;
    } else if (e164.startsWith("0") && (e164.length === 11 || e164.length === 12)) {
      // 0 + DDD + número
      e164 = `55${e164.replace(/^0+/, "")}`;
    } else {
      return { ok: false, reason: "invalid" };
    }

    // BR: 55 + DDD(2) + 8 ou 9 dígitos → 12 ou 13
    if (e164.length !== 12 && e164.length !== 13) {
      return { ok: false, reason: "invalid" };
    }
    const ddd = e164.slice(2, 4);
    if (ddd.startsWith("0")) return { ok: false, reason: "invalid" };
  } else if (e164.length < 10 || e164.length > 15) {
    return { ok: false, reason: "invalid" };
  }

  return {
    ok: true,
    e164Digits: e164,
    displayHint: `+${e164}`,
  };
}

export function isValidWhatsAppPhone(raw: string | null | undefined): boolean {
  return normalizePhoneForWhatsApp(raw).ok;
}
