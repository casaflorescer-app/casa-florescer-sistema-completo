import assert from "node:assert/strict";
import test from "node:test";
import { isCasaBrowserAuth } from "../lib/auth/casa-mode.ts";

test("modo da casa só liga com a variável exatamente 1", () => {
  assert.equal(isCasaBrowserAuth(undefined), false);
  assert.equal(isCasaBrowserAuth(""), false);
  assert.equal(isCasaBrowserAuth("0"), false);
  assert.equal(isCasaBrowserAuth("true"), false);
  assert.equal(isCasaBrowserAuth("1"), true);
});
