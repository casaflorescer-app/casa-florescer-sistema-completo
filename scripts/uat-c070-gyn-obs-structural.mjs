/**
 * C070 B6 — Gin→Obs estrutural (ação + RPC link pregnancy).
 * Marcador: UAT_C070_GYN_OBS_
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
const directory = read("lib/attendance/directory.ts");
const classify = read("lib/attendance/assistential-classify.ts");

ok(
  "Ação Alterar para atendimento obstétrico",
  workspace.includes("Alterar para atendimento obstétrico") &&
    workspace.includes("convertToObstetricAttendance"),
);
ok("Confirmação antes de converter", workspace.includes("window.confirm"));
ok("Atualiza care_specialties obstetrics", workspace.includes('"obstetrics"') && workspace.includes("updatePatient"));
ok("Usa linkEncounterToPregnancy", workspace.includes("linkEncounterToPregnancy"));
ok("RPC link_encounter_to_pregnancy no directory", directory.includes("link_encounter_to_pregnancy"));
ok("Classificação prioriza obstetrics", classify.includes("if (hasObs) return \"obstetrics\""));
ok("Não recria appointment na conversão", !/createAppointment/.test(workspace.split("convertToObstetricAttendance")[1]?.slice(0, 1200) ?? "createAppointment"));

console.log(`\nUAT_C070_GYN_OBS_: ${pass}/${pass + fail}`);
if (fail > 0) {
  console.error("FAIL — C070 gyn→obs.");
  process.exit(1);
}
console.log("OK — UAT_C070_GYN_OBS_ estrutural.");
