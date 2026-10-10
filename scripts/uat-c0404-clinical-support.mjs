/**
 * UAT estrutural C040.4 (sem db push).
 * Valida presença de migration/API/UI e contratos de IA.
 * UAT E2E de banco somente após autorização de apply da 0043.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const checks = [];

function ok(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? `: ${detail}` : ""}`);
}

function read(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

ok(
  "migration 0043 presente",
  existsSync(resolve(root, "supabase/migrations/0043_c0404_clinical_support.sql")),
);

const migration = read("supabase/migrations/0043_c0404_clinical_support.sql");
for (const table of [
  "clinical_exam_catalog",
  "clinical_exam_groups",
  "clinical_exam_group_items",
  "clinical_exam_requests",
  "clinical_exam_request_items",
  "prescription_templates",
  "prescription_template_items",
  "ai_assistance_requests",
  "ai_assistance_results",
]) {
  ok(`tabela ${table}`, migration.includes(`create table if not exists public.${table}`));
}

for (const rpc of [
  "clinical_exam_catalog_upsert",
  "clinical_exam_group_upsert",
  "clinical_exam_request_create",
  "clinical_exam_request_confirm",
  "prescription_template_upsert",
  "prescription_template_apply",
  "ai_assistance_request_create",
  "ai_assistance_save_result",
  "ai_assistance_review",
  "ai_assistance_list",
]) {
  ok(`rpc ${rpc}`, migration.includes(`function public.${rpc}`));
}

ok("RLS enable ai_assistance_results", migration.includes("alter table public.ai_assistance_results enable row level security"));
ok("SECURITY DEFINER assert writer", migration.includes("c0404_assert_encounter_writer"));
ok("audit ai_suggestion_requested", migration.includes("ai_suggestion_requested"));
ok("audit ai_suggestion_accepted", migration.includes("ai_suggestion_accepted"));
ok("audit exam_order_created", migration.includes("exam_order_created"));
ok("audit prescription_template_created", migration.includes("prescription_template_created"));

ok("API clinical-ai", existsSync(resolve(root, "app/api/encounters/clinical-ai/route.ts")));
ok("provider clinical AI", existsSync(resolve(root, "lib/ai/clinical-assistance-provider.ts")));
ok("directory clinical support", existsSync(resolve(root, "lib/attendance/clinical-support-directory.ts")));
ok("UI AiAssistancePanel", existsSync(resolve(root, "components/attendance/AiAssistancePanel.tsx")));
ok("UI ExamRequestPanel", existsSync(resolve(root, "components/attendance/ExamRequestPanel.tsx")));
ok("UI EncounterCloseChecklist", existsSync(resolve(root, "components/attendance/EncounterCloseChecklist.tsx")));

const provider = read("lib/ai/clinical-assistance-provider.ts");
ok("provider não inventa em prompt", provider.includes("NÃO invente"));
ok("provider não prescreve", provider.includes("NÃO prescreva"));
ok("dev mock bloqueado em production", provider.includes('process.env.NODE_ENV === "production"'));
ok("validate payload", provider.includes("validateClinicalAiPayload"));

const api = read("app/api/encounters/clinical-ai/route.ts");
ok("API valida isolamento IDs", api.includes("Isolamento"));
ok("API unavailable message", api.includes("Auxílio de IA indisponível"));

const workspace = read("components/attendance/EncounterWorkspace.tsx");
ok("Workspace monta AiAssistancePanel", workspace.includes("AiAssistancePanel"));
ok("Workspace monta ExamRequestPanel", workspace.includes("ExamRequestPanel"));
ok("Workspace monta EncounterCloseChecklist", workspace.includes("EncounterCloseChecklist"));
ok("Aceite IA aplica SOAP sem autosave silencioso", workspace.includes("onApplySoap"));

const nav = read("components/attendance/WorkspaceSectionNav.tsx");
ok("Nav tem Auxílio IA", nav.includes('id: "auxilio-ia"'));

const rx = read("components/prescriptions/ClinicalPrescriptionPanel.tsx");
ok("Receita usa modelo como cópia", rx.includes("applyPrescriptionTemplate"));
ok("Receita salva modelo", rx.includes("upsertPrescriptionTemplate"));

const failed = checks.filter((c) => !c.pass);
console.log(`\nResultado: ${checks.length - failed.length}/${checks.length} PASS`);
if (failed.length) {
  process.exitCode = 1;
  console.error("Falhas:", failed.map((f) => f.name).join(", "));
} else {
  console.log("UAT estrutural C040.4 OK. E2E de banco pendente de db push autorizado.");
}
