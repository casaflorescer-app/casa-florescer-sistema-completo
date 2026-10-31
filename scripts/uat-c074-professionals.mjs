/**
 * C074 — asserts estruturais do módulo Profissionais.
 * Marcador: UAT_C074_
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

const mig = read("supabase/migrations/0056_c074_professionals_mgmt.sql");
const board = read("components/clinic/ProfessionalsBoard.tsx");
const lib = read("lib/clinic-mgmt/professionals.ts");
const types = read("lib/clinic-mgmt/types.ts");
const search = read("lib/search/entity-search.ts");
const page = read("app/(shell)/app/professionals/page.tsx");
const access = read("lib/auth/access.ts");

ok("Migration 0056 existe", mig.includes("professional_category") && mig.includes("professional_upsert"));
ok("profile_id drop not null", mig.includes("alter column profile_id drop not null"));
ok("display_name + is_active", mig.includes("display_name") && mig.includes("is_active"));
ok("professional_labels LEFT JOIN", /left join public\.profiles/i.test(mig));
ok("RPC grant authenticated", mig.includes("grant execute on function public.professional_upsert"));

ok("ProfessionalsBoard CreateFormShell", board.includes("CreateFormShell"));
ok("ProfessionalsBoard PrimaryCreateButton Novo profissional", board.includes("Novo profissional") && board.includes("PrimaryCreateButton"));
ok("Sem formulário permanente aside", !board.includes('aside className="card h-fit"'));
ok("formOpen gating", board.includes("formOpen") && board.includes("open={formOpen}"));
ok("FormActions Salvar", board.includes("FormActions") && board.includes("Salvar profissional"));
ok("ConfirmDialog ativar/inativar", board.includes("ConfirmDialog"));
ok("RowActions + Overflow", board.includes("RowActions"));
ok("Sem window.confirm", !board.includes("window.confirm"));
ok("Sem SYSTEM_ADMIN", !board.includes("SYSTEM_ADMIN") && !lib.includes("system_admins"));
ok("Sem createUser Auth", !board.includes("createUser") && !lib.includes("auth.admin"));

ok("lib upsertClinicProfessional", lib.includes("professional_upsert"));
ok("lib listClinicProfessionals", lib.includes("listClinicProfessionals"));
ok("types ProfessionalCategory", types.includes("ProfessionalCategory") && types.includes("ClinicProfessional"));

ok("Agenda search filtra inativos", search.includes("is_active === false"));
ok("Página PeopleSubnav preservada", page.includes("PeopleSubnav") && page.includes("ProfessionalsBoard"));
ok("PATH professionals owner|admin", access.includes('prefix: "/app/professionals"'));

ok("Somente leitura removida", !board.includes("Somente leitura nesta versão"));

console.log(`\nUAT_C074_RESULT pass=${pass} fail=${fail}`);
process.exit(fail > 0 ? 1 : 0);
