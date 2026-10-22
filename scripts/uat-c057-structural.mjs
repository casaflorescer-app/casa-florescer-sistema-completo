/**
 * C057 — UAT estrutural (Aluguéis/Contratos).
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

const page = read("app/(shell)/app/rentals/page.tsx");
const detail = read("app/(shell)/app/rentals/[id]/page.tsx");
const moduleUi = read("components/rentals/RentalsModule.tsx");
const directory = read("lib/rentals/directory.ts");
const types = read("lib/rentals/types.ts");
const access = read("lib/auth/access.ts");
const nav = read("lib/auth/app-nav.ts");
const docs = read("docs/c057-rentals.md");
const migrations = readdirSync(resolve(root, "supabase/migrations")).sort();
const mig0050 = migrations.find((f) => f.startsWith("0050"));
const migration = mig0050 ? read(`supabase/migrations/${mig0050}`) : "";

ok("Placeholder removido de /app/rentals", !page.includes("ModulePlaceholder"));
ok("RentalsModule na página", page.includes("RentalsModule"));
ok("Rota detalhe /app/rentals/[id]", detail.includes("RentalsModule") && detail.includes("focusContractId"));
ok("UI: dashboard + contratos", moduleUi.includes("Painel") && moduleUi.includes("Contratos"));
ok("UI: Novo contrato", moduleUi.includes("Novo contrato"));
ok("UI: Renovar/Encerrar/Cancelar", moduleUi.includes("Renovar") && moduleUi.includes("Encerrar") && moduleUi.includes("Cancelar"));
ok("UI: sem ComingSoon/Em breve", !moduleUi.includes("ComingSoon") && !moduleUi.includes("Em breve"));
ok("directory: listRentalContracts", directory.includes("listRentalContracts"));
ok("directory: create/update/end/cancel/renew", directory.includes("rental_contract_create") && directory.includes("rental_contract_renew") && directory.includes("rental_contract_end") && directory.includes("rental_contract_cancel"));
ok("directory: conflito mapeado", directory.includes("RENTAL_CONTRACT_ROOM_OVERLAP") || directory.includes("Conflito de sala"));
ok("directory: profissionais existentes", directory.includes('from("professionals")'));
ok("directory: salas sublet", directory.includes("sublet_consultorio"));
ok("types: cents + status", types.includes("monthlyRentCents") && types.includes("scheduled") && types.includes("RENTAL_EXPIRING_SOON_DAYS"));
ok("PATH_RULES rentals owner|admin", access.includes('prefix: "/app/rentals"') && /prefix:\s*"\/app\/rentals"[\s\S]*owner[\s\S]*admin/.test(access));
ok("Nav Aluguéis + Contratos", nav.includes("Aluguéis") && nav.includes("Contratos") && nav.includes("/app/rentals"));
ok("canAccessClinicManagement no nav gestão", nav.includes("canAccessClinicManagement") || nav.includes("clinicManagement"));
ok("Migration 0050 presente", Boolean(mig0050));
ok("Migration: rental_contract_events", migration.includes("rental_contract_events"));
ok("Migration: RPCs create/renew", migration.includes("rental_contract_create") && migration.includes("rental_contract_renew"));
ok("Migration: write_audit", migration.includes("write_audit"));
ok("Migration: overlap exception", migration.includes("RENTAL_CONTRACT_ROOM_OVERLAP"));
ok("Migration: RLS events", migration.includes("enable row level security") && migration.includes("rental_contract_events_house"));
ok("Migration: SECURITY DEFINER + search_path", migration.includes("security definer") && migration.includes("search_path = public"));
ok("Docs C057", docs.includes("C057") && docs.includes("rental_contracts") && docs.includes("RBAC"));
ok("Sem mock operacional no módulo", !moduleUi.toLowerCase().includes("mock") && !moduleUi.includes("RENTAL_PREVIEW") && !directory.includes("fake"));

console.log(`\nEstrutural C057: ${pass}/${pass + fail}`);
if (fail > 0) process.exit(1);
console.log("OK — higiene estrutural C057.");
