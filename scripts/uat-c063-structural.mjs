/**
 * C063 — UAT estrutural (homologação final / correções P1).
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

const alerts = read("components/alerts/AlertProvider.tsx");
const fixtures = read("lib/preview/fixtures.ts");
const dir = read("components/patients/PatientsDirectory.tsx");
const phys = read("components/patients/PhysicianPatients.tsx");
const reg = read("components/patients/PatientRegistrationForm.tsx");
const docs = read("docs/c063-final-homologation.md");
const roadmap = read("docs/roadmap.md");
const access = read("lib/auth/access.ts");
const nav = read("lib/auth/app-nav.ts");
const nextCfg = read("next.config.mjs");
const migrations = readdirSync(resolve(root, "supabase/migrations")).sort();
const mig55 = migrations.find((f) => f.startsWith("0055"));
const migration = mig55 ? read(`supabase/migrations/${mig55}`) : "";

const appPages = [
  "app/app/page.tsx",
  "app/app/agenda/page.tsx",
  "app/app/patients/page.tsx",
  "app/app/records/page.tsx",
  "app/app/prescriptions/page.tsx",
  "app/app/exams/page.tsx",
  "app/app/portal/page.tsx",
  "app/app/reports/page.tsx",
  "app/app/inventory/page.tsx",
  "app/app/rentals/page.tsx",
  "app/app/clinical-contracts/page.tsx",
  "app/app/workforce/page.tsx",
];

ok("AlertProvider sem previewAlerts", !alerts.includes("previewAlerts") && alerts.includes("useState<AgendaAlert[]>([])"));
ok("fixtures previewAlerts permanece só em lib/preview (legado)", fixtures.includes("previewAlerts"));
ok("PatientsDirectory → /app/patients", dir.includes("/app/patients/new") && dir.includes("/app/patients/${patient.id}") && !dir.includes("/secretaria/"));
ok("PhysicianPatients → /app/records/patient", phys.includes("/app/records/patient/") && !phys.includes("/medica/"));
ok("PatientRegistrationForm redirect /app/patients", reg.includes('router.push("/app/patients")') && !reg.includes("/secretaria/pacientes"));
ok("Docs c063 presentes", docs.includes("C063") && docs.includes("CONCLUÍDO COM RESSALVAS"));
ok("Roadmap aponta C063", roadmap.includes("c063-final-homologation") && roadmap.includes("CONCLUÍDO COM RESSALVAS"));
ok("Migration 0055 presente", Boolean(mig55));
ok("0055: can_read_clinical em manage/select", migration.includes("can_read_clinical") && migration.includes("can_manage_clinical_exam_object"));
ok("0055: orientation audio update apertado", migration.includes("clinical_orientations_audio_update"));
ok("ignoreBuildErrors false", /ignoreBuildErrors\s*:\s*false/.test(nextCfg));
ok("PATH_RULES /app/reports", access.includes('prefix: "/app/reports"'));
ok("Nav Relatórios", nav.includes("/app/reports"));

for (const page of appPages) {
  ok(`rota oficial ${page}`, existsSync(resolve(root, page)));
}

ok("Sem ModulePlaceholder em app/app", (() => {
  const walk = (dirPath) => {
    if (!existsSync(dirPath)) return true;
    for (const name of readdirSync(dirPath, { withFileTypes: true })) {
      const full = resolve(dirPath, name.name);
      if (name.isDirectory()) {
        if (!walk(full)) return false;
      } else if (name.name.endsWith(".tsx") || name.name.endsWith(".ts")) {
        if (readFileSync(full, "utf8").includes("ModulePlaceholder")) return false;
      }
    }
    return true;
  };
  return walk(resolve(root, "app/app"));
})());

console.log(`\nEstrutural C063: ${pass}/${pass + fail}`);
if (fail > 0) process.exit(1);
console.log("OK — higiene estrutural C063.");
