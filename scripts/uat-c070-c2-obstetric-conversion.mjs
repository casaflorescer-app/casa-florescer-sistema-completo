/**
 * C070-C2 — UAT estrutural conversão gin→obs.
 * Marcador: UAT_C070_C2_
 *
 * Cenários cobertos estruturalmente (código): 1–12 do plano.
 * Sem escrita em banco neste UAT.
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

const lib = read("lib/attendance/obstetric-conversion.ts");
const dialog = read("components/attendance/ObstetricConversionDialog.tsx");
const workspace = read("components/attendance/EncounterWorkspace.tsx");
const context = read("components/attendance/ContextAssistencial.tsx");
const auditRpc = read("supabase/migrations/0044_c0405_encounter_closure.sql");
const types = read("lib/attendance/types.ts");

ok("Lib obstetric-conversion existe", lib.includes("resolveObstetricConversion"));
ok("Marcador C070_CONV", lib.includes('CONV_MARKER = "C070_CONV"'));
ok("Cenário 1: uma gestação in_care auto-link", lib.includes("inCare.length === 1") && lib.includes("finishLink"));
ok("Cenário 2: várias → needPick", lib.includes("inCare.length > 1") && lib.includes("needPick: true"));
ok("Cenário 3: sem gestação → needCreate", lib.includes("needCreate: true") && lib.includes("Não há gestação"));
ok("Cenário 4: createPregnancyAndConvert", lib.includes("createPregnancyAndConvert") && lib.includes("createPregnancy"));
ok("Cenário 5: idempotência alreadyLinked", lib.includes("alreadyLinked") && lib.includes("já está no contexto obstétrico"));
ok("Ordem segura: link antes de especialidade falha parcial documentada", lib.includes("Gestação vinculada, mas a especialidade"));
ok("Especialidade via care_specialties obstetrics", lib.includes('"obstetrics"') && lib.includes("ensureObstetricsSpecialty"));
ok("Não cria appointment", !lib.includes("createAppointment") && !lib.includes("from(\"appointments\")"));
ok("Usa linkEncounterToPregnancy (mesmo encounter)", lib.includes("linkEncounterToPregnancy"));
ok("Dialog confirmação Continuar como obstétrico", dialog.includes("Continuar como obstétrico") && dialog.includes("Cancelar"));
ok("Dialog explica preservar agendamento/paciente", dialog.includes("agendamento original") && dialog.includes("nova paciente"));
ok("Dialog pick + create", dialog.includes("Vincular gestação") && dialog.includes("Criar acompanhamento obstétrico"));
ok("Dialog create campos DUM/DPP", dialog.includes("DUM") && dialog.includes("DPP"));
ok("Workspace abre ObstetricConversionDialog", workspace.includes("ObstetricConversionDialog") && workspace.includes("openObstetricConversion"));
ok("Botão some quando pregnancyLinked", workspace.includes("!pregnancyLinked") && workspace.includes("Alterar para atendimento obstétrico"));
ok("Permissão só médica do encounter", workspace.includes("viewerIsEncounterProfessional") && workspace.includes("canOfferPregnancyLink"));
ok("Contexto mostra Atendimento obstétrico", context.includes("Atendimento obstétrico"));
ok("Histórico inicial gin → obs", context.includes("Inicialmente: Ginecologia") && context.includes("Posteriormente: Obstetrícia"));
ok("PregnancyContext notes para auditoria", types.includes("C070_CONV") || types.includes("notes?"));
ok(
  "Auditoria explícita sem migration (marcador notes)",
  lib.includes("appendConversionNote") && lib.includes("buildConversionNote"),
);
ok(
  "encounter_audit_event allowlist sem novo evento (sem migration)",
  auditRpc.includes("clinical_document_finalized") &&
    !auditRpc.includes("converted_to_obstetric"),
);
ok("Sem create table / db push no código C2", !lib.includes("create table") && !dialog.includes("db push"));

console.log(`\nUAT_C070_C2_: ${pass}/${pass + fail}`);
if (fail > 0) {
  console.error("FAIL — C070-C2 estrutural.");
  process.exit(1);
}
console.log("OK — UAT_C070_C2_ conversão obstétrica.");
