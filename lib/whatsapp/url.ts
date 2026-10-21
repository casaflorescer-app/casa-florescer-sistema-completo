import { normalizePhoneForWhatsApp } from "@/lib/whatsapp/phone";

/**
 * Monta URL oficial do WhatsApp (Web / app) com texto pré-preenchido.
 * https://wa.me/<e164>?text=<urlencoded>
 */
export function buildWhatsAppWebUrl(
  phone: string | null | undefined,
  message: string,
): { ok: true; url: string; e164Digits: string } | { ok: false; reason: "empty" | "invalid" } {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized.ok) return { ok: false, reason: normalized.reason };

  const text = String(message ?? "");
  const url = `https://wa.me/${normalized.e164Digits}?text=${encodeURIComponent(text)}`;
  return { ok: true, url, e164Digits: normalized.e164Digits };
}

/** Abre WhatsApp Web/app em nova aba. Retorna false se bloqueado ou inválido. */
export function openWhatsAppWeb(phone: string | null | undefined, message: string): boolean {
  const built = buildWhatsAppWebUrl(phone, message);
  if (!built.ok) return false;
  const win = window.open(built.url, "_blank", "noopener,noreferrer");
  return Boolean(win);
}
