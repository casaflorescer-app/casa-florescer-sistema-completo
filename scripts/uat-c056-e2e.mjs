/**
 * C056 — E2E orquestrador: typescript + structural + security + C055 smoke.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = process.cwd();
const steps = [
  ["typescript", "scripts/uat-c056-typescript.mjs"],
  ["structural", "scripts/uat-c056-structural.mjs"],
  ["security", "scripts/uat-c056-security.mjs"],
  ["c055-structural", "scripts/uat-c055-structural.mjs"],
  ["c055-e2e", "scripts/uat-c055-e2e.mjs"],
];

let failed = 0;
for (const [name, rel] of steps) {
  console.log(`\n======== ${name} ========`);
  const out = spawnSync("node", [resolve(root, rel)], {
    encoding: "utf8",
    shell: true,
    cwd: root,
    env: process.env,
  });
  process.stdout.write(out.stdout || "");
  process.stderr.write(out.stderr || "");
  if (out.status !== 0) {
    console.log(`FAIL — step ${name} exit ${out.status}`);
    failed++;
  } else {
    console.log(`PASS — step ${name}`);
  }
}

console.log(`\nE2E C056 orchestrator: ${steps.length - failed}/${steps.length}`);
process.exit(failed > 0 ? 1 : 0);
