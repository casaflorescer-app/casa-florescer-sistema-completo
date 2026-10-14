import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const checks = [];
const ok = (name, pass, detail = "") => {
  checks.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? `: ${detail}` : ""}`);
};
const read = (rel) => readFileSync(resolve(root, rel), "utf8");

ok("migration 0044", existsSync(resolve(root, "supabase/migrations/0044_c0405_encounter_closure.sql")));
const mig = read("supabase/migrations/0044_c0405_encounter_closure.sql");
ok("tabela encounter_patient_feedback", mig.includes("create table if not exists public.encounter_patient_feedback"));
ok("rpc feedback upsert", mig.includes("encounter_patient_feedback_upsert"));
ok("rpc feedback get", mig.includes("encounter_patient_feedback_get"));
ok("rpc audit event", mig.includes("encounter_audit_event"));
ok("rpc portal targets", mig.includes("patient_portal_feedback_targets"));
ok("unique encounter feedback", mig.includes("unique (encounter_id)"));
ok("RLS feedback", mig.includes("enable row level security"));
ok("não altera actual_end semantics", !mig.includes("drop function public.appointment_record_actual_end"));
ok("não recria encounter_sign", !mig.includes("create or replace function public.encounter_sign"));

ok("UI EncounterFinalReview", existsSync(resolve(root, "components/attendance/EncounterFinalReview.tsx")));
ok("UI feedback clínico", existsSync(resolve(root, "components/attendance/EncounterPatientFeedbackPanel.tsx")));
ok("UI feedback portal", existsSync(resolve(root, "components/portal/PortalEncounterFeedback.tsx")));

const review = read("components/attendance/EncounterFinalReview.tsx");
ok("confirmação assinatura imutável", review.includes("não poderão ser editados"));
ok("pontos a revisar", review.includes("Pontos a revisar"));
ok("resumo atendimento", review.includes("Resumo do atendimento"));
ok("ATENDIMENTO ENCERRADO", review.includes("ATENDIMENTO ENCERRADO"));

const workspace = read("components/attendance/EncounterWorkspace.tsx");
ok("workspace monta FinalReview", workspace.includes("EncounterFinalReview"));
ok("workspace monta feedback", workspace.includes("EncounterPatientFeedbackPanel"));
ok("IA pendente na revisão", workspace.includes("Sugestão de IA pendente"));
ok("audit review_started", workspace.includes("encounter_review_started"));
ok("audit closed", workspace.includes("encounter_closed"));

const portal = read("components/portal/PatientPortalHome.tsx");
ok("portal inclui feedback encounter", portal.includes("PortalEncounterFeedback"));

const nav = read("components/attendance/WorkspaceSectionNav.tsx");
ok("nav revisão", nav.includes("revisao-final"));
ok("nav feedback", nav.includes('id: "feedback"'));

const failed = checks.filter((c) => !c.pass);
console.log(`\nEstrutural C040.5: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exitCode = 1;
else console.log("OK — db push da 0044 ainda pendente de autorização.");
