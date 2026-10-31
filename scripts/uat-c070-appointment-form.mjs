/**
 * C070 B2 — Consulta sem procedimento; procedimento com procedimento.
 * Marcador: UAT_C070_APPT_
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

const createForm = read("components/attendance/AppointmentForm.tsx");
const editForm = read("components/attendance/EditAppointmentForm.tsx");
const directory = read("lib/attendance/directory.ts");
const types = read("lib/attendance/types.ts");
const combobox = read("components/ui/EntityCombobox.tsx");

ok(
  "Create: procedure só obrigatório se kind procedure",
  createForm.includes('kind === "procedure" && !procedureId'),
);
ok(
  "Create: procedureId null em consultation",
  createForm.includes('procedureId: kind === "procedure" ? procedureId : null'),
);
ok(
  "Create: UI consulta sem procedimento",
  createForm.includes("Consulta não exige procedimento"),
);
ok(
  "Edit: mesmo padrão",
  editForm.includes('kind === "procedure" && !procedureId') &&
    editForm.includes('procedureId: kind === "procedure" ? procedureId : null'),
);
ok(
  "createAppointment permite null",
  directory.includes("procedure_id: input.procedureId ?? null"),
);
ok("UpdateAppointmentInput procedureId nullável", types.includes("procedureId: string | null"));
ok(
  "updateAppointment path consultation sem procedure",
  directory.includes("input.procedureId == null") && directory.includes("procedure_id: null"),
);
ok("EntityCombobox existe", combobox.includes("export function EntityCombobox"));
ok("AppointmentForm usa EntityCombobox", createForm.includes("EntityCombobox"));

console.log(`\nUAT_C070_APPT_ form: ${pass}/${pass + fail}`);
if (fail > 0) {
  console.error("FAIL — C070 appointment form.");
  process.exit(1);
}
console.log("OK — UAT_C070_APPT_ consulta vs procedimento.");
