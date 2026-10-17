/**
 * C054 — UAT estrutural (fechamento Receitas + Exames).
 * Sem commit/push/deploy. Sem migration.
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

const rxPanel = read("components/prescriptions/ClinicalPrescriptionPanel.tsx");
const rxMod = read("components/prescriptions/PrescriptionsModule.tsx");
const exMod = read("components/exams/ExamsModule.tsx");
const chart = read("components/attendance/PatientChart.tsx");
const search = read("components/attendance/PatientSearchPanel.tsx");
const appt = read("components/attendance/AppointmentCard.tsx");
const detail = read("components/patients/PatientDetail.tsx");
const flags = read("lib/regulatory/clinical-document-features.ts");
const nav = read("lib/auth/app-nav.ts");

ok("Revisão antes de emitir (reviewing)", rxPanel.includes("reviewing") && rxPanel.includes("Revisão da receita"));
ok("Emitir receita após revisão", rxPanel.includes("Emitir receita") && rxPanel.includes("Voltar e editar"));
ok("Revisar e emitir no rascunho", rxPanel.includes("Revisar e emitir"));
ok("Receitas Module Médico", rxMod.includes("Médico") && !rxMod.includes("Gestão da clínica"));
ok("Exames Module Médico", exMod.includes("Médico") && !exMod.includes("Gestão da clínica"));
ok("PatientChart embute ClinicalPrescriptionPanel", chart.includes("ClinicalPrescriptionPanel"));
ok("PatientChart Pedido ≠ Resultado", chart.includes("Pedidos (solicitação)") && chart.includes("Resultados / anexos"));
ok("PatientChart Novo pedido → /app/exams", chart.includes("/app/exams?patientId="));
ok("PatientChart listExamRequestsForPatient", chart.includes("listExamRequestsForPatient"));
ok("Busca mostra ID para homônimos", search.includes("ID {row.id.slice(0, 8)}") || search.includes("row.id.slice(0, 8)"));
ok("Agenda → Receitas/Exames", appt.includes("/app/prescriptions?patientId=") && appt.includes("/app/exams?patientId="));
ok("Paciente detalhe → Receitas/Exames", detail.includes("/app/prescriptions?patientId=") && detail.includes("/app/exams?patientId="));
ok("SNCR flag false", flags.includes("sncrIntegrationAvailable: false"));
ok("ICP flag false", flags.includes("qualifiedElectronicSignatureAvailable: false"));
ok("Menu Médico com Exames+Receitas", nav.includes('id: "exams"') && nav.includes('id: "prescriptions"'));
ok("Exames documenta encounter obrigatório", exMod.includes("atendimento") && exMod.includes("C040.9"));
ok("Pedido ≠ resultado no módulo", exMod.includes("Pedidos anteriores") || exMod.includes("Pedidos clínicos"));
ok("PDF signed URL receita", rxPanel.includes("createSignedDocumentUrl"));
ok("internal_system na emissão", rxPanel.includes("internal_system"));
ok("applyTemplateItemsAsDraft", rxPanel.includes("applyTemplateItemsAsDraft"));

console.log(`\nEstrutural C054: ${pass}/${pass + fail}`);
if (fail > 0) process.exit(1);
console.log("OK — MIGRATION NÃO NECESSÁRIA; sem commit/push/deploy.");
