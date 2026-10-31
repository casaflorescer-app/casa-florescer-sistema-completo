/**
 * C070-C4.4 — Patient 360 + Quick View + contexto clínico.
 * Marcador: UAT_C070_C44_
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

const snapLib = read("lib/patients/patient-360.ts");
const quick = read("components/patients/PatientQuickView.tsx");
const overview = read("components/patients/Patient360Overview.tsx");
const chart = read("components/attendance/PatientChart.tsx");
const detail = read("components/patients/PatientDetail.tsx");
const list = read("components/patients/PatientList.tsx");
const apptCard = read("components/attendance/AppointmentCard.tsx");
const exams = read("components/exams/ExamsModule.tsx");
const rx = read("components/prescriptions/PrescriptionsModule.tsx");
const search = read("lib/search/entity-search.ts");
const conversion = read("components/attendance/ObstetricConversionDialog.tsx");
const workspace = read("components/attendance/EncounterWorkspace.tsx");
const access = read("lib/auth/access.ts");

ok("loadPatient360Snapshot exportado", snapLib.includes("export async function loadPatient360Snapshot"));
ok("Patient360 includeClinical flag", snapLib.includes("includeClinical"));
ok("Patient360 próxima consulta + gestação", snapLib.includes("nextAppointment") && snapLib.includes("pregnancy"));
ok("Patient360 links chart/agenda/exams/rx", snapLib.includes("chart:") && snapLib.includes("agenda:") && snapLib.includes("exams:") && snapLib.includes("prescriptions:"));
ok("Patient360 sem UUID na UI (só ids internos tipados)", !snapLib.includes("patient_id:") && snapLib.includes("patientId"));

ok("PatientQuickView dialog", quick.includes("data-patient-quick-view") && quick.includes('role="dialog"'));
ok("Quick View clínica só physician", quick.includes('hasStaffRole(authorization, "physician")') && quick.includes("includeClinical"));
ok("Quick View ações Abrir/Agendar", quick.includes("Abrir prontuário") || quick.includes("Abrir paciente"));
ok("Quick View obstetrícia condicional", quick.includes("Obstetrícia") && quick.includes("Nenhuma gestação ativa"));

ok("Patient360Overview cartões", overview.includes("data-patient-360-overview") && overview.includes("Último atendimento") && overview.includes("Próxima consulta"));
ok("Patient360Overview EmptyState", overview.includes("EmptyState"));

ok("PatientChart data-patient-360", chart.includes("data-patient-360") && chart.includes("Patient360Overview"));
ok("PatientChart RowActions Agendar", chart.includes("RowActions") && chart.includes("Agendar"));
ok("PatientChart loadPatient360Snapshot", chart.includes("loadPatient360Snapshot"));

ok("PatientDetail Patient360Overview", detail.includes("Patient360Overview") && detail.includes("loadPatient360Snapshot"));
ok(
  "PatientDetail secretaria sem atalho clínico indevido",
  detail.includes("prontuário clínico fica restrito") ||
    detail.includes("Dados clínicos do prontuário ficam restritos"),
);
ok("PatientDetail Agendar como ação principal", detail.includes('label: "Agendar"'));

ok("PatientList Visão rápida + QuickView", list.includes("Visão rápida") && list.includes("PatientQuickView"));
ok("AppointmentCard Ver paciente + QuickView", apptCard.includes("Ver paciente") && apptCard.includes("PatientQuickView"));
ok("Exams Visão rápida", exams.includes("Visão rápida") && exams.includes("PatientQuickView"));
ok("Receitas Visão rápida", rx.includes("Visão rápida") && rx.includes("PatientQuickView"));

ok("Homônimos: nascimento na opção de busca", search.includes("Nascimento:") && search.includes("formatIsoDateBr"));

ok("Conversão obstétrica preservada (dialog)", conversion.includes("Alterar para atendimento obstétrico"));
ok("Workspace conversão gine→obs", workspace.includes("ObstetricConversion") || workspace.includes("obstetric-conversion") || workspace.includes("conversion"));
ok("PATH records só physician", access.includes('prefix: "/app/records"') && access.includes('hasStaffRole(auth, "physician")'));

// Responsividade estrutural
ok("QuickView mobile items-end / sm:items-center", quick.includes("items-end") && quick.includes("sm:items-center"));
ok("Overview grid sm/xl", overview.includes("sm:grid-cols-2") && overview.includes("xl:grid-cols-3"));
ok("PatientChart header flex responsivo", chart.includes("sm:flex-row"));

console.log(`\nUAT_C070_C44_RESULT pass=${pass} fail=${fail}`);
process.exit(fail > 0 ? 1 : 0);
