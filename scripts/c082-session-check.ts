import assert from "node:assert/strict";
import test from "node:test";
import { openCasaSession, sealCasaSession } from "../lib/auth/casa-session.ts";
import { connectionIsUnsafe } from "../lib/db/casa.ts";

process.env.CASA_SESSION_SECRET = "c082-session-secret-com-32-chars";

const userId = "00000000-0000-4000-8000-000000000101";
const sessionId = "00000000-0000-4000-8000-000000000201";

test("cookie leva o id e abre a mesma sessão", async () => {
  const token = await sealCasaSession(userId, sessionId, 1_700_000_000_000);
  const opened = await openCasaSession(token, 1_700_000_000_000);
  assert.deepEqual(opened, { userId, sessionId });
});

test("cookie sem id da sessão não abre", async () => {
  const token = await sealCasaSession(userId, sessionId, 1_700_000_000_000);
  const body = token.split(".")[0];
  const json = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
    sid?: string;
  };
  delete json.sid;
  const bare = Buffer.from(JSON.stringify(json)).toString("base64url");
  const opened = await openCasaSession(`${bare}.${token.split(".")[1]}`, 1_700_000_000_000);
  assert.equal(opened, null);
});

test("superusuário e quem ignora RLS são recusados", () => {
  assert.equal(connectionIsUnsafe(true, false), true);
  assert.equal(connectionIsUnsafe(false, true), true);
  assert.equal(connectionIsUnsafe(false, false), false);
});
