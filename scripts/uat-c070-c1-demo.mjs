/**
 * C070-C1 — UAT estrutural da massa DEMO (sem write no banco).
 * Marcador: UAT_C070_C1_
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

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

const seed = read("scripts/seed-c070-demo.mjs");

ok("Seed existe", seed.length > 1000);
ok("Marcador DEMO_C070", seed.includes('MARKER = "DEMO_C070"') || seed.includes('const TAG = MARKER'));
ok("Dry-run padrão", seed.includes("dryRun") && seed.includes("DRY-RUN"));
ok("--apply explícito", seed.includes("--apply"));
ok("--cleanup explícito", seed.includes("--cleanup"));
ok("Guard produção thvp", seed.includes("thvp.cloud") && seed.includes("Recusado"));
ok("Idempotência REUSE/CREATE", seed.includes("REUSE") && seed.includes("CREATE"));
ok("Profissionais Samara/Katia/Thais/Barbara/Daiara", [
  "Samara",
  "Katia",
  "Thais",
  "Barbara",
  "Daiara",
].every((n) => seed.includes(n)));
ok("Workforce Franciele/Mikaela", seed.includes("Franciele") && seed.includes("Mikaela"));
ok("Workforce não vira professional", seed.includes("clinic_workforce") && seed.includes("sem vínculo schema"));
ok("3+ salas (incl. procedimentos + sublet)", seed.includes("GIN01") && seed.includes("PROC") && seed.includes("SUBLET"));
ok("Pacientes gineco + obstétrica + procedimento", seed.includes("Gineco") && seed.includes("Obstetrica") && seed.includes("Procedimento"));
ok("Gestação DEMO", seed.includes("ensurePregnancy") && seed.includes("gestação"));
ok("Agenda past/near/future", seed.includes("APPT_PAST") && seed.includes("APPT_TODAY") && seed.includes("APPT_FUTURE"));
ok("Consulta sem procedure_id null", seed.includes("procedure_id: null") && seed.includes('kind: "consultation"'));
ok("Procedimento com procedure_id", seed.includes('kind: "procedure"') && seed.includes("procColpo"));
ok("Receita + exame", seed.includes("ensurePrescription") && seed.includes("ensureExamOrder"));
ok("Estoque classes medicamento/cirúrgico/office/pantry", [
  "clinical_lot_controlled",
  "surgical_consumable",
  "office",
  "pantry",
].every((c) => seed.includes(c)));
ok("Lotes FEFO (dois lotes)", seed.includes("L1-") && seed.includes("L2-") && seed.includes("ensureLot"));
ok("Contrato locação ≠ clínico", seed.includes("rental_contracts") && seed.includes("contrato de locação"));
ok("Cleanup ordenado FK", seed.includes("prescription_items") && seed.includes("encounters") && seed.includes("item_lots"));
ok("Cleanup só DEMO_C070", seed.includes("somente DEMO_C070") || seed.includes("somente marcador DEMO_C070"));
ok("Sem migration neste arquivo", !seed.includes("create table") && !seed.includes("db push"));
ok("Sem alteração RLS", !seed.includes("create policy") && !seed.includes("enable row level security"));

const dry = spawnSync(process.execPath, ["scripts/seed-c070-demo.mjs"], {
  cwd: root,
  encoding: "utf8",
});
ok("Dry-run exit 0", dry.status === 0);
ok("Dry-run sem write claim", /dry-run|DRY-RUN/i.test(dry.stdout || "") && /Nenhum write/i.test(dry.stdout || ""));
ok(
  "Dry-run reporta contagens do plano",
  /"professionals":\s*5/.test(dry.stdout || "") &&
    /"patients":\s*7/.test(dry.stdout || "") &&
    /"workforce":\s*2/.test(dry.stdout || ""),
);

console.log(`\nUAT_C070_C1_ demo: ${pass}/${pass + fail}`);
if (fail > 0) {
  console.error("FAIL — C070-C1 estrutural.");
  process.exit(1);
}
console.log("OK — UAT_C070_C1_ massa DEMO estrutural.");
