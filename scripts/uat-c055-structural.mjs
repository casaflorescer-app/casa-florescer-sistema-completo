/**
 * C055 — UAT estrutural (Retorno do atendimento).
 * Verifica implementação real, não apenas remoção de ComingSoon.
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

const workspace = read("components/attendance/EncounterWorkspace.tsx");
const returnPanel = read("components/attendance/ClinicalReturnPanel.tsx");
const header = read("components/attendance/EncounterHeader.tsx");
const chart = read("components/attendance/PatientChart.tsx");
const timeline = read("components/attendance/EncounterTimeline.tsx");
const agenda = read("components/attendance/AgendaPage.tsx");
const apptForm = read("components/attendance/AppointmentForm.tsx");
const apptCard = read("components/attendance/AppointmentCard.tsx");
const directory = read("lib/attendance/directory.ts");
const types = read("lib/attendance/types.ts");
const returnLink = read("lib/attendance/return-link.ts");
const returnCtx = read("lib/attendance/return-context.ts");
const migration = read("supabase/migrations/0049_c055_encounter_return.sql");
const summary = read("lib/attendance/patient-summary.ts");
const comingSoon = read("components/attendance/WorkspaceComingSoon.tsx");

ok("ComingSoon removido do Workspace", !workspace.includes("WorkspaceComingSoon"));
ok("ClinicalReturnPanel no Workspace", workspace.includes("ClinicalReturnPanel"));
ok("Painel: iniciar retorno", returnPanel.includes("Iniciar retorno agora"));
ok("Painel: agendar retorno", returnPanel.includes("Agendar retorno"));
ok("Painel: ver atendimento anterior", returnPanel.includes("Ver atendimento anterior"));
ok("Painel: retornos deste atendimento", returnPanel.includes("Retornos deste atendimento"));
ok("Painel: sem Em breve/ComingSoon", !returnPanel.includes("Em breve") && !returnPanel.includes("ComingSoon"));
ok("Painel: encounterOpenReturn", returnPanel.includes("encounterOpenReturn"));
ok("Painel: somente leitura do anterior", returnPanel.includes("somente leitura"));
ok("Header identifica Retorno", header.includes("returnOfEncounterId") && header.includes("Retorno"));
ok("Header link origem", header.includes("ver origem"));
ok("PatientChart origem", chart.includes("Atendimento de origem"));
ok("PatientChart ação Retorno", chart.includes("#retorno") || chart.includes(">Retorno<"));
ok("Timeline rótulo Retorno", summary.includes("Retorno em andamento") && summary.includes('"Retorno"'));
ok("Timeline link origem", timeline.includes("Atendimento de origem"));
ok("types.returnOfEncounterId", types.includes("returnOfEncounterId"));
ok("directory.encounterOpenReturn", directory.includes("encounterOpenReturn") && directory.includes("encounter_open_return"));
ok("directory.listReturnsOfEncounter", directory.includes("listReturnsOfEncounter"));
ok("directory.enrichEncountersWithReturnOf", directory.includes("enrichEncountersWithReturnOf"));
ok("return-link encode/parse", returnLink.includes("C055_RETURN_OF:") && returnLink.includes("parseReturnOfNote"));
ok("return-link agendaReturnHref", returnLink.includes("agendaReturnHref"));
ok("return-context prior SOAP/anamnese", returnCtx.includes("loadPriorEncounterContext") && returnCtx.includes("soap") && returnCtx.includes("anamnesis"));
ok("Migration 0049 coluna", migration.includes("return_of_encounter_id"));
ok("Migration 0049 RPC", migration.includes("create or replace function public.encounter_open_return"));
ok("Migration 0049 idempotência", migration.includes("Idempotência") || migration.includes("idempot"));
ok("Migration 0049 write_audit", migration.includes("write_audit"));
ok("Migration 0049 guard imutável", migration.includes("RETURN_OF_IMMUTABLE") || migration.includes("encounters_return_of_guard"));
ok("Migration 0049 grant authenticated", migration.includes("grant execute on function public.encounter_open_return"));
ok("Agenda parseReturnOf + open return", agenda.includes("parseReturnOfNote") && agenda.includes("encounterOpenReturn"));
ok("AppointmentForm Agendar retorno", apptForm.includes("Agendar retorno") && apptForm.includes("returnOfEncounterId"));
ok("AppointmentForm encodeReturnOfNote", apptForm.includes("encodeReturnOfNote"));
ok("AppointmentCard badge Retorno", apptCard.includes("isReturnAppointment"));
ok("Workspace Voltar ao retorno", workspace.includes("Voltar ao retorno") && workspace.includes("fromReturn"));
ok("WorkspaceComingSoon ainda existe (não usado no retorno)", comingSoon.includes("Em breve"));
ok("Sem prontuário paralelo /app/return", !existsSync(resolve(root, "app/app/return")) && !existsSync(resolve(root, "app/return")));

console.log(`\nEstrutural C055: ${pass}/${pass + fail}`);
if (fail > 0) process.exit(1);
console.log("OK — Retorno estruturalmente operacional; migration 0049 no repo (db push separado).");
