import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const checks = [];
const ok = (name, pass, detail = "") => {
  checks.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? `: ${detail}` : ""}`);
};
const read = (rel) => readFileSync(resolve(root, rel), "utf8");

ok("migration 0046", existsSync(resolve(root, "supabase/migrations/0046_c0407_clinical_documents.sql")));
const mig = read("supabase/migrations/0046_c0407_clinical_documents.sql");
ok("tabela clinical_document_artifacts", mig.includes("create table if not exists public.clinical_document_artifacts"));
ok("signature_kind internal_system", mig.includes("internal_system") && mig.includes("ICP-Brasil"));
ok("content_sha256", mig.includes("content_sha256"));
ok("bucket clinical-documents privado", mig.includes("'clinical-documents'") && mig.includes("public = excluded.public"));
ok("issue from prescription", mig.includes("clinical_document_issue_from_prescription"));
ok("issue from exam request", mig.includes("clinical_document_issue_from_exam_request"));
ok("imutabilidade DOCUMENT_IMMUTABLE", mig.includes("DOCUMENT_IMMUTABLE"));
ok("sem exclusão física", mig.includes("DOCUMENT_DELETE_FORBIDDEN"));
ok("RLS patient select", mig.includes("clinical_document_artifacts_patient_select"));
ok("campos profissionais opcionais", mig.includes("council_uf") && mig.includes("rqe_number"));
ok("não destrutiva", !/drop\s+table/i.test(mig));

ok("pdf-lib no package", read("package.json").includes('"pdf-lib"'));
ok("API render-pdf", existsSync(resolve(root, "app/api/documents/render-pdf/route.ts")));
ok("UI EncounterDocumentsPanel", existsSync(resolve(root, "components/attendance/EncounterDocumentsPanel.tsx")));
ok("UI PortalClinicalDocuments", existsSync(resolve(root, "components/portal/PortalClinicalDocuments.tsx")));

const workspace = read("components/attendance/EncounterWorkspace.tsx");
ok("workspace monta Documentos", workspace.includes("EncounterDocumentsPanel"));
ok("retorno agora C040.9", workspace.includes('stage="C040.9"'));

const nav = read("components/attendance/WorkspaceSectionNav.tsx");
ok("nav documentos", nav.includes('id: "documentos"'));

const portal = read("components/portal/PatientPortalHome.tsx");
ok("portal documentos clínicos", portal.includes("PortalClinicalDocuments"));

const rx = read("components/prescriptions/ClinicalPrescriptionPanel.tsx");
ok("receita emite documento", rx.includes("Emitir documento (PDF)"));

const exam = read("components/attendance/ExamRequestPanel.tsx");
ok("exame emite documento", exam.includes("Emitir documento (PDF)"));
ok("indicação clínica UI", exam.includes("Indicação clínica"));

const failed = checks.filter((c) => !c.pass);
console.log(`\nEstrutural C040.7: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exitCode = 1;
else console.log("OK — db push da 0046 pendente de autorização expressa.");
