/**
 * C070-C9 — formulários de criação sob demanda (sem aside permanente).
 * Marcador: UAT_C070_C9_
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

const shell = read("components/ui/CreateFormShell.tsx");
const rooms = read("components/clinic/RoomsBoard.tsx");
const specs = read("components/clinic-mgmt/SpecialtiesModule.tsx");
const workforce = read("components/clinic-mgmt/WorkforceModule.tsx");
const contracts = read("components/clinic-mgmt/ClinicalContractsModule.tsx");

ok("CreateFormShell existe", shell.includes("export function CreateFormShell"));
ok("CreateFormShell data-create-form-shell", shell.includes('data-create-form-shell="true"'));
ok("CreateFormShell open gating", shell.includes("if (!open) return null"));
ok("CreateFormShell FormActions-compatible sizes", /size\??\s*=\s*"md"/.test(shell) || shell.includes("SIZE_CLASS"));

function assertOnDemand(name, src, { cta, formId, permanentAsideForbidden }) {
  ok(`${name} usa CreateFormShell`, src.includes("CreateFormShell"));
  ok(`${name} formOpen / open`, src.includes("formOpen") && src.includes("open={formOpen}"));
  ok(`${name} CTA PrimaryCreateButton ${cta}`, src.includes("PrimaryCreateButton") && src.includes(cta));
  ok(`${name} sem grid lateral permanente`, !src.includes("lg:grid-cols-[minmax(0,1fr)_"));
  if (permanentAsideForbidden) {
    const asideId = new RegExp(`<aside[^>]*id=["']${formId}["']`);
    ok(
      `${name} sem aside card permanente com ${formId}`,
      !asideId.test(src) && !src.includes(`<aside className="card h-fit" id="${formId}"`),
    );
  }
  ok(
    `${name} ${formId} só no shell`,
    src.includes(`formId="${formId}"`) || src.includes(`id="${formId}"`),
  );
  ok(`${name} CTA abre formulário (startCreate|openCreate)`, /startCreate|openCreate/.test(src));
}

assertOnDemand("RoomsBoard", rooms, {
  cta: "Nova sala",
  formId: "room-create-form",
  permanentAsideForbidden: true,
});
assertOnDemand("SpecialtiesModule", specs, {
  cta: "Nova especialidade",
  formId: "specialty-create-form",
  permanentAsideForbidden: true,
});
assertOnDemand("WorkforceModule", workforce, {
  cta: "Novo funcionário",
  formId: "workforce-create-form",
  permanentAsideForbidden: true,
});
assertOnDemand("ClinicalContractsModule", contracts, {
  cta: "Novo contrato",
  formId: "clinical-contract-form",
  permanentAsideForbidden: true,
});

ok("ClinicalContracts Novo termo no CTA", contracts.includes("Novo termo"));
ok("ClinicalContracts FormActions no shell", contracts.includes("FormActions"));
ok("RoomsBoard FormActions + closeForm", rooms.includes("FormActions") && rooms.includes("closeForm"));
ok("Specialties FormActions + closeForm", specs.includes("FormActions") && specs.includes("closeForm"));
ok("Workforce FormActions + closeForm", workforce.includes("FormActions") && workforce.includes("closeForm"));

console.log(`\nUAT_C070_C9_RESULT pass=${pass} fail=${fail}`);
process.exit(fail > 0 ? 1 : 0);
