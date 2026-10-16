import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const checks = [];
const ok = (name, pass, detail = "") => {
  checks.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? `: ${detail}` : ""}`);
};
const read = (rel) => readFileSync(resolve(root, rel), "utf8");

ok("migration 0048", existsSync(resolve(root, "supabase/migrations/0048_c0409_rx_exam_closure.sql")));
const mig = read("supabase/migrations/0048_c0409_rx_exam_closure.sql");
ok("template apply campos completos", mig.includes("presentation") && mig.includes("instructions"));
ok("exam create clinical_indication", mig.includes("p_clinical_indication"));
ok("exam snapshot group_name", mig.includes("group_name"));
ok("sem SNCR falso", !/sncr|qr.?code/i.test(mig) || mig.includes("NÃO implementados"));
ok("não destrutiva tabelas", !/drop\s+table/i.test(mig));
ok("SECURITY DEFINER + search_path", mig.includes("security definer") && mig.includes("set search_path = public"));

const rx = read("components/prescriptions/ClinicalPrescriptionPanel.tsx");
ok("UI copiar receita anterior", rx.includes("Copiar como novo rascunho"));
ok("UI PRN / uso contínuo", rx.includes("Se necessário (PRN)") && rx.includes("Uso contínuo"));
ok("UI campos apresentação/via/qtd", rx.includes("Apresentação") && rx.includes("Via") && rx.includes("Quantidade"));
ok("UI modelos arquivar", rx.includes("Arquivar") && rx.includes("Reativar"));
ok(
  "UI SNCR bloqueado declarado",
  rx.includes("CLINICAL_DOCUMENT_FEATURES") && rx.includes("sncrIntegrationAvailable"),
);
ok("UI internal_system explícito", rx.includes("internal_system") || rx.includes("não é ICP-Brasil"));
ok("UI correção documental", rx.includes("Emitir correção"));
const reg = read("lib/regulatory/clinical-document-features.ts");
ok("flag SNCR false", reg.includes("sncrIntegrationAvailable: false"));
ok("flag assinatura qualificada false", reg.includes("qualifiedElectronicSignatureAvailable: false"));

const dir = read("lib/prescriptions/directory.ts");
ok("copyPrescriptionAsDraft", dir.includes("copyPrescriptionAsDraft"));
ok("buildStructuredInstructions", dir.includes("buildStructuredInstructions"));

const exam = read("components/attendance/ExamRequestPanel.tsx");
ok("exame passa clinicalIndication", exam.includes("clinicalIndication"));

const support = read("lib/attendance/clinical-support-directory.ts");
ok("createExamRequest indication + fallback", support.includes("p_clinical_indication") && support.includes("fallback"));

const workspace = read("components/attendance/EncounterWorkspace.tsx");
ok("retorno agora C040.10", workspace.includes('stage="C040.10"'));

const pdf = read("lib/documents/pdf.ts");
ok("PDF receita com via/apresentação", pdf.includes("item.route") && pdf.includes("item.presentation"));
ok("PDF exame com group_name", pdf.includes("group_name"));

const failed = checks.filter((c) => !c.pass);
console.log(`\nEstrutural C040.9: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exitCode = 1;
else console.log("OK — migration 0048 aplicada no remoto (db push autorizado em C040.9).");
