import assert from "node:assert/strict";
import test from "node:test";
import { passwordResetDeliveryEnabled } from "../lib/auth/password-reset.ts";
import { hashPasswordResetToken } from "../lib/auth/password-reset-token.ts";

test("recuperação não envia e-mail sem SMTP", () => {
  assert.equal(passwordResetDeliveryEnabled({} as NodeJS.ProcessEnv), false);
  assert.equal(
    passwordResetDeliveryEnabled({ CASA_SMTP_HOST: " " } as NodeJS.ProcessEnv),
    false,
  );
});

test("o token de redefinição vira hash e não volta igual", () => {
  const hash = hashPasswordResetToken("token-de-exemplo-com-32-chars-xx");
  assert.equal(hash.length, 64);
  assert.notEqual(hash, "token-de-exemplo-com-32-chars-xx");
});
