import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const checks = [];
const ok = (name, pass, detail = "") => {
  checks.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? `: ${detail}` : ""}`);
};
const read = (rel) => readFileSync(resolve(root, rel), "utf8");

ok("migration 0047", existsSync(resolve(root, "supabase/migrations/0047_c0408_orientation_document.sql")));
const mig = read("supabase/migrations/0047_c0408_orientation_document.sql");
ok("RPC issue_from_orientation", mig.includes("clinical_document_issue_from_orientation"));
ok("reusa artifacts 0046", mig.includes("clinical_document_artifacts") && !/create table/i.test(mig));
ok("sem novo bucket", !mig.includes("storage.buckets"));
ok("signature internal_system", mig.includes("internal_system") && mig.includes("ICP-Brasil"));
ok("share default false", mig.includes("p_share_with_patient boolean default false"));
ok("exige publicada", mig.includes("ORIENTATION_NOT_PUBLISHED"));
ok("exige texto", mig.includes("ORIENTATION_TEXT_REQUIRED"));
ok("SECURITY DEFINER + search_path", mig.includes("security definer") && mig.includes("set search_path = public"));
ok("não destrutiva", !/drop\s+table/i.test(mig) && !/drop\s+column/i.test(mig));
ok("audit ORIENTATION_DOCUMENT", mig.includes("ORIENTATION_DOCUMENT_FINALIZED"));
ok("não altera C035 publish state", mig.includes("Não altera clinical_orientations"));

ok("schema 0046 já tem orientation", read("supabase/migrations/0046_c0407_clinical_documents.sql").includes("'orientation'"));

const directory = read("lib/documents/directory.ts");
ok("directory issue orientation", directory.includes("clinical_document_issue_from_orientation"));

const issue = read("lib/documents/issue.ts");
ok("issueOrientationDocumentWithPdf", issue.includes("issueOrientationDocumentWithPdf"));

const pdf = read("lib/documents/pdf.ts");
ok("PDF branch orientacao", pdf.includes('documentKind === "orientacao"') && pdf.includes("ORIENTACAO CLINICA"));

const panel = read("components/orientations/ClinicalOrientationsPanel.tsx");
ok("UI Emitir documento orientação", panel.includes("Emitir documento (PDF)"));
ok("UI share explícito", panel.includes("Disponibilizar o PDF à paciente"));
ok("UI distingue publicar vs documento", panel.includes("Publicar no portal") && panel.includes("emitir documento PDF"));

const workspace = read("components/attendance/EncounterWorkspace.tsx");
ok("retorno operacional C055", workspace.includes("ClinicalReturnPanel") && !workspace.includes("WorkspaceComingSoon"));

const docs = read("components/attendance/EncounterDocumentsPanel.tsx");
ok("central menciona orientação", docs.includes("Orientação"));

ok(
  "script portal fixture vinculada",
  existsSync(resolve(root, "scripts/uat-c0408-portal.mjs")),
);
const portalScript = read("scripts/uat-c0408-portal.mjs");
ok(
  "portal usa patient_accounts UAT",
  portalScript.includes("patient_accounts") && portalScript.includes("uat.b34.patient@exemplo.local"),
);
ok(
  "portal testa available_to_patient true/false",
  portalScript.includes("available_to_patient=true") &&
    portalScript.includes("available_to_patient=false"),
);

const failed = checks.filter((c) => !c.pass);
console.log(`\nEstrutural C040.8: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exitCode = 1;
else console.log("OK — db push da 0047 pendente de autorização expressa.");
