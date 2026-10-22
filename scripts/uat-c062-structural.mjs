/**
 * C062 — UAT estrutural (Relatórios e indicadores).
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

const page = read("app/(shell)/app/reports/page.tsx");
const mod = read("components/reports/ReportsModule.tsx");
const dir = read("lib/reports/directory.ts");
const period = read("lib/reports/period.ts");
const types = read("lib/reports/types.ts");
const access = read("lib/auth/access.ts");
const nav = read("lib/auth/app-nav.ts");
const docs = read("docs/c062-reports.md");
const migrations = readdirSync(resolve(root, "supabase/migrations")).sort();
const mig = migrations.find((f) => f.startsWith("0054"));
const migration = mig ? read(`supabase/migrations/${mig}`) : "";

ok("Placeholder removido", !page.includes("ModulePlaceholder"));
ok("ReportsModule na página", page.includes("ReportsModule"));
ok("UI abas visão/atendimentos/estoque", mod.includes("Visão geral") && mod.includes("Atendimentos") && mod.includes("Estoque"));
ok("Filtro de período", mod.includes("Período analisado") && period.includes("last_30") && period.includes("America/Sao_Paulo"));
ok("Sem mock numérico", !mod.includes("MOCK_") && !dir.includes("fakeCount") && !mod.includes("Math.random"));
ok("directory: summary + detail RPCs", dir.includes("reports_operational_summary") && dir.includes("reports_appointments_detail"));
ok("CSV exportação", dir.includes("toCsv") && mod.includes("Exportar CSV"));
ok("PATH_RULES owner|admin", access.includes('prefix: "/app/reports"') && access.includes('hasStaffRole(auth, "owner")'));
ok("Nav Relatórios e indicadores", nav.includes("Relatórios e indicadores") && nav.includes("/app/reports"));
ok("Migration 0054 presente", Boolean(mig));
ok("0054: can_access_reports", migration.includes("can_access_reports"));
ok("0054: summary SECURITY DEFINER + search_path", migration.includes("reports_operational_summary") && migration.includes("security definer") && migration.includes("search_path = public"));
ok("0054: scheduled_starts_at", migration.includes("scheduled_starts_at"));
ok("0054: return_of_encounter_id", migration.includes("return_of_encounter_id"));
ok("0054: REPORTS_FORBIDDEN", migration.includes("REPORTS_FORBIDDEN"));
ok("Docs dicionário", docs.includes("Dicionário") && docs.includes("scheduled_starts_at") && docs.includes("NÃO DISPONÍVEL"));
ok("Types labels status/kind", types.includes("APPOINTMENT_STATUS_LABEL") && types.includes("consultation"));
ok("READ-ONLY (sem upsert clínico)", !mod.includes("upsert") && !dir.includes(".insert("));

console.log(`\nEstrutural C062: ${pass}/${pass + fail}`);
if (fail > 0) process.exit(1);
console.log("OK — higiene estrutural C062.");
