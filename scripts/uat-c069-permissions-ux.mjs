/**
 * C069 — UX de permissões: clínicos exigem physician; nav obstétrica.
 * Estrutural (sem login).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (rel) => readFileSync(resolve(root, rel), "utf8");

let failed = 0;
function ok(name, cond) {
  if (cond) console.log(`PASS — ${name}`);
  else {
    console.log(`FAIL — ${name}`);
    failed += 1;
  }
}

const panel = read("components/clinic-admin/ClinicPermissionsPanel.tsx");
const nav = read("lib/auth/app-nav.ts");
const access = read("lib/auth/access.ts");
const mig = read("supabase/migrations/0004_profile_permissions.sql");

ok("Panel lista módulos physician-only", panel.includes('PHYSICIAN_ONLY_MODULES') || panel.includes('"prontuario"'));
ok("Panel desabilita clínicos sem médica", panel.includes("clinicalLocked") && panel.includes("disabled={clinicalLocked}"));
ok("Panel aponta Usuários → Acessos", /Usuários → Acessos/.test(panel));
ok("Panel mensagem amigável trigger prontuario", /Prontuário só pode ser atribuído/.test(panel));
ok("Panel mensagem amigável trigger obstetrico", /Programação obstétrica só pode ser atribuída/.test(panel));
ok("Nav tem obstetrícia para physician", nav.includes('href: "/app/obstetrics"') && nav.includes("visible: physician"));
ok("PATH_RULES records permanece physician", /prefix:\s*"\/app\/records"[\s\S]*?hasStaffRole\(auth,\s*"physician"\)/.test(access));
ok("PATH_RULES obstetrics permanece physician", /prefix:\s*"\/app\/obstetrics"[\s\S]*?hasStaffRole\(auth,\s*"physician"\)/.test(access));
ok("Trigger 0004 intacto (prontuario)", mig.includes("prontuario só pode ser atribuído a physician"));
ok("Trigger 0004 intacto (obstetrico)", mig.includes("obstetrico só pode ser atribuído a physician"));

console.log(failed ? `\nUAT_C069_permissions_ux: FAIL (${failed})` : "\nUAT_C069_permissions_ux: PASS");
process.exit(failed ? 1 : 0);
