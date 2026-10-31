/**
 * C073 — asserts estruturais do provisionamento modelo B (2 practices).
 * Marcador: UAT_C073_
 * NÃO executa Auth/SQL; NÃO usa --apply.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
let pass = 0;
let fail = 0;

function ok(label, cond) {
  if (cond) {
    console.log(`PASS — ${label}`);
    pass++;
  } else {
    console.log(`FAIL — ${label}`);
    fail++;
  }
}

function read(rel) {
  const p = resolve(root, rel);
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf8");
}

const provision = read("scripts/provision-owner-physicians.mjs");

ok("Script C073 modelo B", provision.includes("C073") && provision.includes("modelo B"));
ok("CF_PRACTICE_ID_SAMARA", provision.includes("CF_PRACTICE_ID_SAMARA"));
ok("CF_PRACTICE_ID_THAIS", provision.includes("CF_PRACTICE_ID_THAIS"));
ok("Recusa CF_PRACTICE_ID legado", provision.includes("legado não é mais aceito"));
ok("Practices devem ser distintas", provision.includes("devem ser distintos"));
ok("assertPractice kind=house", provision.includes('kind !== "house"') || provision.includes("kind=house"));
ok("listUsers paginado", provision.includes("perPage") && provision.includes("page > 50"));
ok("CRM opcional via env", provision.includes("CF_PHYSICIAN_1_CRM") && provision.includes("CF_PHYSICIAN_2_CRM"));
ok("Sem SYSTEM_ADMIN", provision.includes("SYSTEM_ADMIN: não concedido"));
ok("Isolamento: roles só na própria practice", provision.includes("apenas em ${doctor.practiceEnv}") || provision.includes("apenas em"));
ok("Sem senha hardcoded", !/CF_PHYSICIAN_1_PASSWORD\s*=\s*['\"][^'\"]+['\"]/.test(provision));

const dry = spawnSync(process.execPath, ["scripts/provision-owner-physicians.mjs"], {
  cwd: root,
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" },
  encoding: "utf8",
});
ok("Dry-run estrutural exit 0", dry.status === 0);
ok(
  "Dry-run mensagem modelo B",
  (dry.stdout || "").includes("DRY-RUN") && (dry.stdout || "").includes("CF_PRACTICE_ID_SAMARA"),
);

console.log(`\nUAT_C073_RESULT pass=${pass} fail=${fail}`);
process.exit(fail > 0 ? 1 : 0);
