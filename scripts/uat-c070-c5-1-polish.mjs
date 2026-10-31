/**
 * C070-C5.1 — polimento pré-apresentação (P1 linguagem / cadastro×prontuário / relacionamentos).
 * Marcador: UAT_C070_C51_
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

const chart = read("components/attendance/PatientChart.tsx");
const detail = read("components/patients/PatientDetail.tsx");
const records = read("components/attendance/RecordsIndex.tsx");
const workspace = read("components/attendance/EncounterWorkspace.tsx");
const finalReview = read("components/attendance/EncounterFinalReview.tsx");
const clinicalReturn = read("components/attendance/ClinicalReturnPanel.tsx");
const comingSoon = read("components/attendance/WorkspaceComingSoon.tsx");
const recording = read("components/attendance/EncounterRecordingPanel.tsx");
const header = read("components/attendance/EncounterHeader.tsx");
const central = read("components/relationship/RelationshipCenter.tsx");
const access = read("lib/auth/access.ts");

// P1-1 — frases de UI (não nomes de variáveis/componentes)
ok("PatientChart sem 'Workspace do'", !chart.includes("Workspace do") && !chart.includes("EncounterWorkspace existente"));
ok("PatientChart sem 'Encounters autorizados'", !chart.includes("Encounters autorizados"));
ok("PatientChart linguagem atendimento", chart.includes("Atendimentos desta paciente") || chart.includes("Histórico clínico"));
ok("RecordsIndex sem Workspace médico", !records.includes("Workspace médico"));
ok("RecordsIndex Atendimentos em andamento", records.includes("Atendimentos em andamento") || records.includes("status aberto"));
ok("EncounterWorkspace notice sem 'deste encounter'", !workspace.includes("deste encounter"));
ok("FinalReview sem 'deste encounter'", !finalReview.includes("deste encounter"));
ok("ClinicalReturn sem 'neste encounter'", !clinicalReturn.includes("neste encounter"));
ok("ComingSoon sem Workspace Médico", !comingSoon.includes("Workspace Médico"));
ok("Recording sem C040.4", !recording.includes("C040.4"));

// P1-2
ok("PatientDetail eyebrow Cadastro", detail.includes("Cadastro da paciente"));
ok("PatientChart eyebrow Prontuário", chart.includes(">Prontuário<") || chart.includes("Prontuário\n") || chart.includes("Prontuário"));
ok("PatientDetail Abrir prontuário", detail.includes("Abrir prontuário"));
ok("PatientChart Abrir cadastro", chart.includes("Abrir cadastro"));
ok("EncounterHeader Prontuário da paciente", header.includes("Prontuário da paciente"));

// P1-3
ok("Central sem Código da paciente", !central.includes("Código da paciente"));
ok("Central sem Informe o ID da paciente", !central.includes("Informe o ID da paciente"));
ok("Central EntityCombobox opt-out", central.includes("EntityCombobox") && central.includes("searchPatientOptions"));
ok("Central Pesquisar paciente…", central.includes("Pesquisar paciente"));

// P1-4
ok("PatientChart sem C040.9 na UI", !chart.includes("C040.9") && !chart.includes("regra C040"));
ok("Exames mensagem operacional", chart.includes("primeiro abra o atendimento"));

// Segurança estrutural
ok("PATH records physician preservado", access.includes('prefix: "/app/records"') && access.includes('hasStaffRole(auth, "physician")'));
ok("Patient 360 ainda no chart", chart.includes("Patient360Overview") && chart.includes("loadPatient360Snapshot"));
ok("Conversão obstétrica preservada no workspace", workspace.includes("ObstetricConversionDialog"));

console.log(`\nUAT_C070_C51_RESULT pass=${pass} fail=${fail}`);
process.exit(fail > 0 ? 1 : 0);
