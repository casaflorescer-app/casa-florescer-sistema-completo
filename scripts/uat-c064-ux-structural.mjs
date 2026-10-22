/**
 * C064 — UAT estrutural UX (ações + componentes).
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
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

const uiFiles = [
  "components/ui/buttonStyles.ts",
  "components/ui/OverflowMenu.tsx",
  "components/ui/RowActions.tsx",
  "components/ui/PageHeader.tsx",
  "components/ui/EmptyState.tsx",
];

for (const f of uiFiles) {
  ok(`componente ${f}`, existsSync(resolve(root, f)));
}

const list = read("components/patients/PatientList.tsx");
const card = read("components/attendance/AppointmentCard.tsx");
const detail = read("components/patients/PatientDetail.tsx");
const docs = read("docs/c064-ux-modernization.md");
const platformUi = read("components/platform/Ui.tsx");

ok("PatientList usa RowActions", list.includes("RowActions") && list.includes('label: "Prontuário"'));
ok("PatientList sem flex-col items-end na coluna ações", !list.includes("flex-col items-end"));
ok("PatientList PageHeader + EmptyState", list.includes("PageHeader") && list.includes("EmptyState"));
ok("AppointmentCard usa RowActions", card.includes("RowActions") && card.includes("OverflowItem"));
ok("PatientDetail PageHeader + RowActions", detail.includes("PageHeader") && detail.includes("RowActions"));
ok("OverflowMenu com aria", read("components/ui/OverflowMenu.tsx").includes("aria-haspopup"));
ok("RowActions data-row-actions", read("components/ui/RowActions.tsx").includes('data-row-actions="true"'));
ok("Ui reexporta buttonStyles", platformUi.includes("buttonStyles"));
ok("Docs C064", docs.includes("RowActions") && docs.includes("flex-col items-end"));

// Varredura: nenhum PatientList-like stack residual óbvio em patients/
ok(
  "sem empilhamento flex-col items-end em components/patients",
  (() => {
    const dir = resolve(root, "components/patients");
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".tsx")) continue;
      const src = read(`components/patients/${name}`);
      if (src.includes("flex-col items-end")) return false;
    }
    return true;
  })(),
);

console.log(`\nEstrutural C064 UX: ${pass}/${pass + fail}`);
if (fail > 0) process.exit(1);
console.log("OK — higiene UX C064.");
