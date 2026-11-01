import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

test("remoção da foto no modo da casa não usa o Storage", () => {
  const route = read("app/api/casa/files/route.ts");
  const directory = read("lib/patients/directory.ts");
  const detail = read("components/patients/PatientDetail.tsx");
  assert.match(route, /export async function DELETE/);
  assert.match(route, /can_access_patient_photo/);
  assert.match(route, /removePrivateFile/);
  assert.match(directory, /method: "DELETE"/);
  const removal = directory.slice(directory.indexOf("export async function removePatientPhoto"));
  const casaBranch = removal.slice(0, removal.indexOf("const path = patientPhotoObjectPath"));
  assert.match(casaBranch, /method: "DELETE"/);
  assert.doesNotMatch(casaBranch, /storage\.from/);
  assert.match(detail, /isCasaBrowserAuth\(\)/);
  assert.match(detail, /removePatientPhoto\(supabase/);
});

test("conversão de gestação aceita cliente nulo e preserva o agendamento", () => {
  const conversion = read("lib/attendance/obstetric-conversion.ts");
  const workspace = read("components/attendance/EncounterWorkspace.tsx");
  assert.match(conversion, /export async function createPregnancyAndConvert\(\s*supabase: SupabaseClient \| null/);
  assert.match(conversion, /linkEncounterToPregnancy/);
  assert.match(conversion, /O agendamento original foi preservado/);
  assert.match(workspace, /\(!supabase && !isCasaBrowserAuth\(\)\)/);
  assert.doesNotMatch(workspace, /if \(!supabase \|\| !encounter \|\| linkBusy\) return/);
});

test("cadastro, edição e busca de paciente seguem o modo da casa sem cliente", () => {
  const directory = read("lib/patients/directory.ts");
  const edit = read("components/patients/PatientEditForm.tsx");
  assert.match(directory, /getPatientCasa/);
  assert.match(directory, /updatePatientCasa/);
  assert.match(directory, /searchPatientsCasa/);
  assert.match(edit, /isCasaBrowserAuth\(\)/);
  assert.match(edit, /updatePatient\(supabase/);
});

test("o modo publicado continua no cliente quando a flag não é 1", () => {
  const mode = read("lib/auth/casa-mode.ts");
  const client = read("lib/supabase/client.ts");
  assert.match(mode, /flag === "1"/);
  assert.match(client, /NEXT_PUBLIC_CASA_AUTH === "1"/);
  assert.match(client, /createBrowserClient/);
});
