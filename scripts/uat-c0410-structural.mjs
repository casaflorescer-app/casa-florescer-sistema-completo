/**
 * UAT estrutural C040.10 — paciente como centro (sem alterar banco).
 * Marcador de massa E2E (quando houver): UAT_C0410_
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const results = [];
const ok = (name, cond, detail = "") => {
  results.push({ name, ok: Boolean(cond), detail });
  console.log(`${cond ? "PASS" : "FAIL"} — ${name}${detail ? `: ${detail}` : ""}`);
};
const read = (rel) => readFileSync(resolve(root, rel), "utf8");

ok("rota oficial patient chart", existsSync(resolve(root, "app/app/records/patient/[patientId]/page.tsx")));
ok(
  "alias convergência /patients/.../prontuario",
  existsSync(resolve(root, "app/app/patients/[patientId]/prontuario/page.tsx")),
);
ok("PatientChart.tsx", existsSync(resolve(root, "components/attendance/PatientChart.tsx")));
ok("PatientSearchPanel.tsx", existsSync(resolve(root, "components/attendance/PatientSearchPanel.tsx")));

const dir = read("lib/patients/directory.ts");
ok("searchPatients server-side", dir.includes("export async function searchPatients"));
ok("patientChartHref único", dir.includes("patientChartHref") && dir.includes("/app/records/patient/"));

const alias = read("app/app/patients/[patientId]/prontuario/page.tsx");
ok("alias redirect patientChartHref", alias.includes("redirect") && alias.includes("patientChartHref"));

const chart = read("components/attendance/PatientChart.tsx");
ok("chart reutiliza PatientClinicalSummary", chart.includes("PatientClinicalSummary"));
ok("chart reutiliza EncounterTimeline", chart.includes("EncounterTimeline"));
ok("chart abre Workspace existente", chart.includes("/app/records/${row.id}") || chart.includes("`/app/records/${row.id}"));
ok("chart troca paciente", chart.includes("Pesquisar outra paciente") || chart.includes("PatientSearchPanel"));
ok("sem tabela paralela no chart", !chart.includes("create table") && !chart.includes("from(\"clinical_notes_copy\")"));

const records = read("components/attendance/RecordsIndex.tsx");
ok("Prontuário → pesquisa", records.includes("PatientSearchPanel"));

const detail = read("components/patients/PatientDetail.tsx");
ok("Pacientes → Abrir prontuário", detail.includes("Abrir prontuário") && detail.includes("patientChartHref"));

const header = read("components/attendance/EncounterHeader.tsx");
ok("Encounter → Prontuário da paciente", header.includes("Prontuário da paciente") && header.includes("patientChartHref"));

const card = read("components/attendance/AppointmentCard.tsx");
ok("Agenda → Abrir prontuário", card.includes("Abrir prontuário") && card.includes("patientChartHref"));

const list = read("components/patients/PatientList.tsx");
ok("lista usa searchPatients", list.includes("searchPatients"));
ok("lista Abrir prontuário", list.includes("Prontuário") && list.includes("patientChartHref"));

const failed = results.filter((r) => !r.ok);
console.log(`\nEstrutural C040.10: ${results.length - failed.length}/${results.length}`);
if (failed.length) {
  for (const f of failed) console.log(`  FAIL: ${f.name}`);
  process.exitCode = 1;
} else {
  console.log("OK — sem migration; sem commit/push/deploy nesta etapa.");
}
