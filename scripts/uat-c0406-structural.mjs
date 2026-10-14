import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const checks = [];
const ok = (name, pass, detail = "") => {
  checks.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? `: ${detail}` : ""}`);
};
const read = (rel) => readFileSync(resolve(root, rel), "utf8");

ok("migration 0045", existsSync(resolve(root, "supabase/migrations/0045_c0406_encounter_integrity.sql")));
const mig = read("supabase/migrations/0045_c0406_encounter_integrity.sql");
ok("encounter_sign exige soap_min", mig.includes("SOAP_REQUIRED_BEFORE_SIGN") && mig.includes("soap_min"));
ok("prescriptions gate ENCOUNTER_NOT_OPEN", mig.includes("prescriptions_before_write") && mig.includes("ENCOUNTER_NOT_OPEN"));
ok("prescription_items gate", mig.includes("prescription_items_guard") && mig.includes("ENCOUNTER_NOT_OPEN"));
ok("orientation create gate", mig.includes("clinical_orientation_create") && mig.includes("ENCOUNTER_NOT_OPEN"));
ok("orientation schema preservado", mig.includes("transcription_status") && mig.includes("professional_id"));
ok("não destrutiva (sem drop table)", !/drop\s+table/i.test(mig));
ok("não altera actual_end RPC", !mig.includes("appointment_record_actual_end"));

const directory = read("lib/attendance/directory.ts");
ok("mensagem SOAP_REQUIRED", directory.includes("SOAP_REQUIRED_BEFORE_SIGN"));
ok("listRecentEncountersForProfessional", directory.includes("listRecentEncountersForProfessional"));

const records = read("components/attendance/RecordsIndex.tsx");
ok("índice lista abertos", records.includes("Atendimentos em aberto"));
ok("índice lista recentes assinados", records.includes("Atendimentos recentes"));
ok("consultar signed read-only", records.includes("Consultar"));

const workspace = read("components/attendance/EncounterWorkspace.tsx");
ok("hasTranscription dinâmico", workspace.includes("hasTranscription: reviewCounts.hasTranscription"));
ok("listEncounterRecordings na revisão", workspace.includes("listEncounterRecordings"));
ok("FinalReview no workspace", workspace.includes("EncounterFinalReview"));

const failed = checks.filter((c) => !c.pass);
console.log(`\nEstrutural C040.6: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exitCode = 1;
else console.log("OK — estrutural C040.6.");
