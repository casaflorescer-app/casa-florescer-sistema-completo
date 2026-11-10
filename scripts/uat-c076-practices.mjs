/**
 * C076 — cadastro de práticas house na Administração.
 * Marcador: UAT_C076_
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

const api = read("app/api/admin/practices/route.ts");
const patch = read("app/api/admin/practices/[id]/route.ts");
const panel = read("components/clinic-admin/ClinicPracticesPanel.tsx");
const page = read("app/(shell)/app/admin/practices/page.tsx");
const subnav = read("components/clinic-admin/AdminSubnav.tsx");
const hub = read("app/(shell)/app/admin/page.tsx");
const adminHelper = read("lib/supabase/admin.ts");

const adminCaller = read("lib/auth/admin-caller.ts");
const casaPractices = read("lib/casa/admin-practices.ts");

ok("API route GET/POST existe", api.includes("export async function GET") && api.includes("export async function POST"));
ok("API dual-mode resolveAdminCaller", api.includes("resolveAdminCaller") && api.includes("canManagePractices"));
ok("API ramo GoTrue createServiceRoleClient", api.includes("createServiceRoleClient"));
ok("API ramo Casa listHousePracticesCasa", api.includes("listHousePracticesCasa"));
ok("API só kind house", api.includes('kind: "house"') || api.includes('"house"') || casaPractices.includes("kind = 'house'"));
ok("admin-caller ACL SYSTEM_ADMIN/owner/admin", adminCaller.includes("isSystemAdmin") && adminCaller.includes("isHouseOwner"));
ok("API bootstrap owner na primeira house", api.includes("isFirstHouse") && (api.includes('role: "owner"') || api.includes("linkOwnerOnPracticeCasa")));
ok("API não concede SYSTEM_ADMIN a terceiros", !api.includes("grant_system_admin"));
ok("PATCH route existe", patch.includes("export async function PATCH"));
ok("PATCH dual-mode + Casa update", patch.includes("resolveAdminCaller") && patch.includes("updateHousePracticeCasa"));
ok("PATCH não altera code/kind", !patch.includes("patch.code") && !patch.includes("patch.kind"));

ok("ClinicPracticesPanel CreateFormShell", panel.includes("CreateFormShell") && panel.includes('formId="clinic-practice-form"'));
ok("ClinicPracticesPanel PrimaryCreateButton", panel.includes("PrimaryCreateButton") && panel.includes("Nova prática"));
ok("ClinicPracticesPanel POST /api/admin/practices", panel.includes('"/api/admin/practices"'));
ok("página /app/admin/practices", page.includes("ClinicPracticesPanel") && page.includes('active="practices"'));
ok("AdminSubnav práticas", subnav.includes("/app/admin/practices") && subnav.includes("practices"));
ok("hub Administração link práticas", hub.includes("/app/admin/practices"));
ok("admin helper service role", adminHelper.includes("getServiceRoleKey"));
ok("sem migration neste ciclo", !existsSync(resolve(root, "supabase/migrations/0057_c076_practices.sql")));

console.log(`\nUAT_C076_ ${pass} pass / ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
