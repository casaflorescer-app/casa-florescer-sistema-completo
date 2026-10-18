/**
 * C056 — TypeScript + ignoreBuildErrors.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
let pass = 0;
let fail = 0;

function ok(label, cond, detail = "") {
  if (cond) {
    console.log(`PASS — ${label}${detail ? `: ${detail}` : ""}`);
    pass++;
  } else {
    console.log(`FAIL — ${label}${detail ? `: ${detail}` : ""}`);
    fail++;
  }
}

const nextConfig = existsSync(resolve(root, "next.config.mjs"))
  ? readFileSync(resolve(root, "next.config.mjs"), "utf8")
  : "";

ok(
  "ignoreBuildErrors false",
  /ignoreBuildErrors:\s*false/.test(nextConfig) &&
    !/ignoreBuildErrors:\s*true/.test(nextConfig),
);

const tsc = spawnSync("npx", ["tsc", "--noEmit"], {
  encoding: "utf8",
  shell: true,
  cwd: root,
});
const out = `${tsc.stdout || ""}\n${tsc.stderr || ""}`;
const errors = (out.match(/error TS\d+/g) || []).length;
ok("tsc --noEmit zero erros", tsc.status === 0 && errors === 0, `errors=${errors}`);

const patients = readFileSync(resolve(root, "lib/patients/directory.ts"), "utf8");
ok(
  "listPatients sem reassign tipado incompatível",
  patients.includes("PATIENT_LIST_PHOTO_COLUMNS") &&
    patients.includes("isMissingPhotoPathColumn") &&
    !patients.includes("result = await supabase.from(\"patients\").select(PATIENT_LIST_COLUMNS)"),
);

const mw = readFileSync(resolve(root, "lib/supabase/middleware.ts"), "utf8");
const srv = readFileSync(resolve(root, "lib/supabase/server.ts"), "utf8");
ok("middleware CookieToSet tipado", mw.includes("CookieToSet") && mw.includes("setAll(cookiesToSet: CookieToSet[])"));
ok("server CookieToSet tipado", srv.includes("CookieToSet") && srv.includes("setAll(cookiesToSet: CookieToSet[])"));
ok("sem @ts-ignore nos fixes", !mw.includes("@ts-ignore") && !srv.includes("@ts-ignore"));

console.log(`\nTypeScript C056: ${pass}/${pass + fail}`);
if (fail > 0) process.exit(1);
console.log("OK — TypeScript 0 erros; ignoreBuildErrors=false.");
