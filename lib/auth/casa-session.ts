const COOKIE_NAME = "casa_session";
const MAX_AGE_SECONDS = 60 * 60 * 12;

export { COOKIE_NAME, MAX_AGE_SECONDS };

type Payload = {
  v: 1;
  sub: string;
  sid: string;
  exp: number;
};

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToBytes(value: string) {
  const pad = (4 - (value.length % 4)) % 4;
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat(pad);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function secret() {
  const value = process.env.CASA_SESSION_SECRET;
  if (!value || value.length < 32) return null;
  return value;
}

async function hmacKey(action: "sign" | "verify") {
  const value = secret();
  if (!value) return null;
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(value),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [action],
  );
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function sealCasaSession(userId: string, sessionId: string, now = Date.now()) {
  if (!isUuid(userId) || !isUuid(sessionId)) throw new Error("Sessão sem usuário válido.");
  const key = await hmacKey("sign");
  if (!key) throw new Error("CASA_SESSION_SECRET ausente.");
  const payload: Payload = {
    v: 1,
    sub: userId,
    sid: sessionId,
    exp: Math.floor(now / 1000) + MAX_AGE_SECONDS,
  };
  const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
  );
  return `${body}.${bytesToBase64Url(signature)}`;
}

export async function openCasaSession(token: string | undefined, now = Date.now()) {
  if (!token) return null;
  const key = await hmacKey("verify");
  if (!key) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlToBytes(parts[1]),
    new TextEncoder().encode(parts[0]),
  );
  if (!valid) return null;
  let payload: Payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[0]))) as Payload;
  } catch {
    return null;
  }
  if (
    payload.v !== 1 ||
    !isUuid(payload.sub) ||
    !isUuid(payload.sid) ||
    payload.exp * 1000 <= now
  ) {
    return null;
  }
  return { userId: payload.sub, sessionId: payload.sid };
}

export function casaSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  };
}
