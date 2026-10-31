import { createHash, randomBytes } from "crypto";

const RESET_MINUTES = 30;

export function newPasswordResetToken() {
  return randomBytes(32).toString("base64url");
}

export function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function passwordResetExpiry(now = Date.now()) {
  return new Date(now + RESET_MINUTES * 60 * 1000);
}
