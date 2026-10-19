/**
 * C059 — UAT segurança (PWA/cache não cria bypass; PATH_RULES preservadas).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

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

const sw = read("public/sw.js");
const access = read("lib/auth/access.ts");
const pathRules = access.includes("PATH_RULES") ? access : read("lib/auth/authorization.ts");
const shell = read("components/layout/AppShell.tsx");
const pwa = read("components/pwa/PwaRegister.tsx");

const clinicalHints = [
  "localStorage.setItem",
  "sessionStorage.setItem",
  "indexedDB",
  "openDatabase",
];

ok("SW não intercepta navigate (sem shell offline autenticado)", sw.includes('mode === "navigate"'));
ok("SW só assets estáticos", sw.includes("isStaticAsset") && sw.includes("/_next/static/"));
ok("SW não cacheia /api", !sw.includes('"/api"') && !sw.includes("pathname.startsWith(\"/api\")"));
ok("SW não cacheia /app HTML", !sw.includes('pathname.startsWith("/app")'));
ok("PATH_RULES patients", pathRules.includes("/app/patients"));
ok("PATH_RULES records", pathRules.includes("/app/records") || pathRules.includes("records"));
ok("PATH_RULES rentals", pathRules.includes("/app/rentals"));
ok("PATH_RULES inventory", pathRules.includes("/app/inventory"));
ok("PATH_RULES portal", pathRules.includes("/app/portal") || access.includes("/app/portal"));
ok("Shell não altera RBAC", !shell.includes("canAccess") || shell.includes("navSectionsFor"));
ok("AppShell usa authorization (sem bypass)", shell.includes("authorization") && shell.includes("navSectionsFor"));
ok("PWA register sem auth bypass", !pwa.includes("localStorage") && !pwa.includes("sessionStorage"));

for (const hint of clinicalHints) {
  ok(`SW sem ${hint}`, !sw.toLowerCase().includes(hint.toLowerCase()));
}

console.log(`\nSegurança C059: ${pass}/${pass + fail}`);
if (fail > 0) process.exit(1);
console.log("OK — segurança C059 (estático).");
