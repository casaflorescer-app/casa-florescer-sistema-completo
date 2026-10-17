/**
 * C042 — UAT estrutural (Receitas + Exames módulos operacionais).
 * Sem commit/push/deploy. Sem massa permanente.
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

const rxPage = read("app/app/prescriptions/page.tsx");
const exPage = read("app/app/exams/page.tsx");
const rxMod = read("components/prescriptions/PrescriptionsModule.tsx");
const exMod = read("components/exams/ExamsModule.tsx");
const rxPanel = read("components/prescriptions/ClinicalPrescriptionPanel.tsx");
const search = read("components/attendance/PatientSearchPanel.tsx");
const chart = read("components/attendance/PatientChart.tsx");
const nav = read("lib/auth/app-nav.ts");
const placeholder = read("components/modules/ModulePlaceholder.tsx");
const docs = read("lib/documents/directory.ts");
const support = read("lib/attendance/clinical-support-directory.ts");
const rxDir = read("lib/prescriptions/directory.ts");

ok("Receitas page usa PrescriptionsModule", rxPage.includes("PrescriptionsModule"));
ok("Exames page usa ExamsModule", exPage.includes("ExamsModule"));
ok("Receitas NÃO é ModulePlaceholder", !rxPage.includes("ModulePlaceholder"));
ok("Exames NÃO é ModulePlaceholder", !exPage.includes("ModulePlaceholder"));
ok("Receitas cabeçalho Médico", rxMod.includes("Médico") && rxMod.includes("Receitas"));
ok("Exames cabeçalho Médico", exMod.includes("Médico") && exMod.includes("Exames"));
ok("Receitas sem GESTÃO DA CLÍNICA", !rxMod.includes("Gestão da clínica"));
ok("Exames sem GESTÃO DA CLÍNICA", !exMod.includes("Gestão da clínica"));
ok("Receitas pesquisa paciente", rxMod.includes("PatientSearchPanel") && rxMod.includes("onSelectPatient"));
ok("Exames pesquisa paciente", exMod.includes("PatientSearchPanel") && exMod.includes("onSelectPatient"));
ok("Receitas Abrir prontuário", rxMod.includes("patientChartHref") || rxMod.includes("Abrir prontuário"));
ok("Exames Abrir prontuário", exMod.includes("patientChartHref") || exMod.includes("Abrir prontuário"));
ok("Receitas reutiliza ClinicalPrescriptionPanel", rxMod.includes("ClinicalPrescriptionPanel"));
ok("Exames reutiliza ExamRequestPanel", exMod.includes("ExamRequestPanel"));
ok("Exames distingue pedido ≠ resultado", exMod.includes("clinical_exam_requests") || exMod.includes("Pedidos anteriores"));
ok("Exames ClinicalExamsPanel (resultados)", exMod.includes("ClinicalExamsPanel"));
ok("PatientSearchPanel onSelectPatient", search.includes("onSelectPatient"));
ok("PatientChart link Nova receita", chart.includes("/app/prescriptions?patientId="));
ok("PatientChart link Novo pedido", chart.includes("/app/exams?patientId="));
ok("Menu Exames/Receitas em Médico", nav.includes('id: "exams"') && nav.includes('id: "prescriptions"'));
ok("listDocumentsForPatient", docs.includes("listDocumentsForPatient"));
ok("listExamRequestsForPatient", support.includes("listExamRequestsForPatient"));
ok("applyTemplateItemsAsDraft (sem encounter)", rxDir.includes("applyTemplateItemsAsDraft"));
ok("Modelo sem encounter no painel", rxPanel.includes("applyTemplateItemsAsDraft"));
ok("PDF signed URL no painel receita", rxPanel.includes("createSignedDocumentUrl"));
ok("Pedido exige encounter aberto (msg)", exMod.includes("atendimento aberto") || exMod.includes("encounter"));
ok("Placeholder GESTÃO ainda existe só para outros módulos", placeholder.includes("Gestão da clínica"));

console.log(`\nEstrutural C042: ${pass}/${pass + fail}`);
if (fail > 0) process.exit(1);
console.log("OK — sem migration; sem commit/push/deploy nesta etapa.");
