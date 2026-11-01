import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { bindCasaRpcArguments, isInternalSqlError, serializeJsonbArgument } from "../lib/casa/jsonb-arg.ts";

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
  assert.match(workspace, /!pregnancyLinked && \(supabase \|\| isCasaBrowserAuth\(\)\)/);
  assert.doesNotMatch(workspace, /if \(!supabase \|\| !encounter \|\| linkBusy\) return/);
  const form = read("components/pregnancies/PregnancyForm.tsx");
  const load = form.slice(form.indexOf("useEffect(() => {"), form.indexOf("const principals"));
  assert.match(load, /isCasaBrowserAuth\(\)/);
  assert.match(load, /listProfessionalLabels\(db\)/);
  assert.doesNotMatch(load, /if \(!client\)/);
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

test("término clínico no modo da casa recalcula a previsão sem o cliente", () => {
  const workspace = read("components/attendance/EncounterWorkspace.tsx");
  const directory = read("lib/attendance/directory.ts");
  const rpc = read("lib/casa/rpc.ts");
  const end = workspace.slice(workspace.indexOf("async function onEndAttendance"));
  const block = end.slice(0, end.indexOf("setNotice(predictionNotice)"));
  assert.match(block, /recalculateDayPredictions\(supabase/);
  assert.match(block, /if \(bounds\)/);
  assert.doesNotMatch(block, /if \(bounds && supabase\)/);
  assert.doesNotMatch(block, /storage\.from|createClient\(/);
  assert.match(directory, /listAppointmentsCasa/);
  assert.match(directory, /listProcedureDurationsCasa/);
  assert.match(directory, /listHistoricalDurationsCasa/);
  assert.match(directory, /listAgendaBlocksCasa/);
  assert.match(directory, /callCasaRpc\("appointment_predictions_append"/);
  assert.match(rpc, /appointment_predictions_append: 1/);
  assert.match(rpc, /appointment_predictions_append: \[0\]/);
  assert.match(rpc, /clinical_orientation_create: \[0\]/);
  assert.match(rpc, /clinical_orientation_save_draft: \[0\]/);
  assert.match(rpc, /fn === "clinical_orientation_versions_list"/);
  const access = read("lib/auth/access.ts");
  assert.match(access, /prefix: "\/app\/finance"/);
  assert.match(access, /item\.canCashier/);
  assert.match(access, /prefix: "\/app\/admin\/users"/);
  assert.match(access, /auth\.isSystemAdmin/);
  const adminLayout = read("app/(shell)/app/admin/layout.tsx");
  assert.match(adminLayout, /pathname === "\/app\/admin\/users"/);
  assert.match(adminLayout, /authorization\.isSystemAdmin/);
  assert.match(adminLayout, /RequireRole roles=\{\["owner", "admin"\]\}/);
  const versions = read("lib/orientations/directory.ts");
  assert.match(versions, /data && typeof data === "object" \? \[data\] : \[\]/);
  assert.match(block, /A previsão da agenda não foi gravada/);
  assert.doesNotMatch(block, /será atualizada na próxima carga/);
  const agenda = read("components/attendance/AgendaPage.tsx");
  const casaAgenda = agenda.slice(agenda.indexOf("if (casa)"), agenda.indexOf("if (!supabase) return"));
  assert.match(casaAgenda, /recalculateDayPredictions\(null/);
  assert.match(casaAgenda, /persist: true/);
});

test("argumento jsonb vira JSON textual uma vez e escalar permanece", () => {
  const items = [{ appointment_id: "abc", predicted_starts_at: "2026-11-01T18:05:00.000Z" }];
  const once = serializeJsonbArgument(items);
  assert.equal(typeof once, "string");
  assert.deepEqual(JSON.parse(once), items);
  assert.equal(serializeJsonbArgument(once), once);
  assert.equal(serializeJsonbArgument(null), null);
  const bound = bindCasaRpcArguments(["uuid-escalar", items], [1]);
  assert.equal(bound[0], "uuid-escalar");
  assert.equal(bound[1], once);
  assert.equal(isInternalSqlError("invalid input syntax for type json"), true);
  assert.equal(isInternalSqlError("NOT_AUTHENTICATED"), false);
});

test("o modo publicado continua no cliente quando a flag não é 1", () => {
  const mode = read("lib/auth/casa-mode.ts");
  const client = read("lib/supabase/client.ts");
  assert.match(mode, /flag === "1"/);
  assert.match(client, /NEXT_PUBLIC_CASA_AUTH === "1"/);
  assert.match(client, /createBrowserClient/);
});
