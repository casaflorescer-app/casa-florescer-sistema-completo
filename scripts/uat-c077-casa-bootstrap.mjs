/**
 * C077 — bootstrap Casa Auth: práticas + staff médica.
 * Marcador: UAT_C077_
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

const adminCaller = read("lib/auth/admin-caller.ts");
const casaPractices = read("lib/casa/admin-practices.ts");
const practicesApi = read("app/api/admin/practices/route.ts");
const staffApi = read("app/api/casa/staff/route.ts");
const usersPanel = read("components/clinic-admin/ClinicUsersPanel.tsx");
const access = read("lib/auth/access.ts");
const adminLayout = read("app/(shell)/app/admin/layout.tsx");

ok("admin-caller getAuthUser dual-mode", adminCaller.includes("getAuthUser") && adminCaller.includes("loadCasaAuthorization"));
ok("admin-caller canManagePractices", adminCaller.includes("canManagePractices"));
ok("casa admin-practices withCasaUser insert", casaPractices.includes("withCasaUser") && casaPractices.includes("insert into public.practice_units"));
ok("casa admin-practices bootstrap owner link", casaPractices.includes("linkOwnerOnPracticeCasa") || casaPractices.includes("role)"));
ok("practices API modo casa sem SERVICE_ROLE obrigatório no ramo", practicesApi.includes('caller.mode === "casa"') && practicesApi.includes("insertHousePracticeCasa"));
ok("staff API gera temporaryPassword", staffApi.includes("generateTemporaryPassword") && staffApi.includes("temporaryPassword"));
ok("staff API password opcional no schema", staffApi.includes("password:") && staffApi.includes(".optional()"));
ok("ClinicUsersPanel isCasaBrowserAuth", usersPanel.includes("isCasaBrowserAuth"));
ok("ClinicUsersPanel POST /api/casa/staff", usersPanel.includes('"/api/casa/staff"'));
ok("ClinicUsersPanel reload aceita supabase null + Casa", usersPanel.includes("!supabase && !isCasaBrowserAuth()"));
ok("PATH_RULES /app/admin inclui isSystemAdmin", /prefix:\s*"\/app\/admin"[\s\S]*?isSystemAdmin/.test(access));
ok("ClinicAdminLayout SYSTEM_ADMIN", adminLayout.includes("isSystemAdmin") && adminLayout.includes("owner"));

console.log(`\nUAT_C077_ ${pass} pass / ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
