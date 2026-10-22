/**
 * C060 — UAT estrutural (Gestão Clínica).
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
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

const migrations = readdirSync(resolve(root, "supabase/migrations")).sort();
const mig = migrations.find((f) => f.startsWith("0052"));
const migration = mig ? read(`supabase/migrations/${mig}`) : "";
const nav = read("lib/auth/app-nav.ts");
const access = read("lib/auth/access.ts");
const specsPage = read("app/(shell)/app/specialties/page.tsx");
const workforcePage = read("app/(shell)/app/workforce/page.tsx");
const clinicalPage = read("app/(shell)/app/clinical-contracts/page.tsx");
const specsMod = read("components/clinic-mgmt/SpecialtiesModule.tsx");
const workMod = read("components/clinic-mgmt/WorkforceModule.tsx");
const clinMod = read("components/clinic-mgmt/ClinicalContractsModule.tsx");
const rooms = read("components/clinic/RoomsBoard.tsx");
const prof = read("components/clinic/ProfessionalsBoard.tsx");
const docs = read("docs/c060-clinical-management.md");

ok("Migration 0052 presente", Boolean(mig));
ok("clinic_specialties", migration.includes("clinic_specialties"));
ok("professional_specialties", migration.includes("professional_specialties"));
ok("clinic_workforce", migration.includes("clinic_workforce"));
ok("obstetric_availability_contracts", migration.includes("obstetric_availability_contracts"));
ok("procedure_agreements", migration.includes("procedure_agreements"));
ok("RPC specialty upsert", migration.includes("clinic_specialty_upsert"));
ok("RPC workforce upsert", migration.includes("clinic_workforce_upsert"));
ok("RPC obstetric create/end", migration.includes("obstetric_availability_contract_create") && migration.includes("obstetric_availability_contract_end"));
ok("RPC procedure acknowledge", migration.includes("procedure_agreement_acknowledge"));
ok("write_audit nas mutações", (migration.match(/write_audit/g) || []).length >= 6);
ok("SECURITY DEFINER + search_path", migration.includes("security definer") && migration.includes("search_path = public"));
ok("RLS house owner|admin", migration.includes("is_house_staff") && migration.includes("owner"));
ok("Médico locatário ≠ workforce (comentário)", migration.includes("Distinto de professionals") || migration.includes("NÃO confunde"));
ok("Placeholder specialties fechado", !specsPage.includes("ModulePlaceholder") && specsPage.includes("SpecialtiesModule"));
ok("Página workforce", workforcePage.includes("WorkforceModule"));
ok("Página clinical-contracts", clinicalPage.includes("ClinicalContractsModule"));
ok("Nav Profissionais (não Funcionários no professionals)", nav.includes('label: "Profissionais"') && nav.includes('href: "/app/professionals"'));
ok("Nav Funcionários → /app/workforce", nav.includes('href: "/app/workforce"') && nav.includes('label: "Funcionários"'));
ok("Nav Contratos clínicos", nav.includes("/app/clinical-contracts"));
ok("PATH_RULES workforce + clinical-contracts", access.includes('prefix: "/app/workforce"') && access.includes('prefix: "/app/clinical-contracts"'));
ok("Rooms CRUD UI", rooms.includes("upsertRoom") || rooms.includes("Nova sala"));
ok("Professionals distinção locatário", prof.includes("não é funcionário") || prof.includes("locatário"));
ok("Termo ≠ checkbox (UI ciência)", clinMod.includes("Registrar ciência") && clinMod.includes("acknowledgedByName"));
ok("Obstétrico parto normal/cesárea", clinMod.includes("Parto normal") && clinMod.includes("Cesariana"));
ok("Docs C060", docs.includes("0052") && docs.includes("db push") && docs.includes("locatário"));
ok("Sem mock operacional", !specsMod.toLowerCase().includes("mock") && !workMod.toLowerCase().includes("fake data"));

console.log(`\nEstrutural C060: ${pass}/${pass + fail}`);
if (fail > 0) process.exit(1);
console.log("OK — higiene estrutural C060.");
