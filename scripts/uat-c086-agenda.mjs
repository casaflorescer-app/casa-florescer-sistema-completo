import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

test("criar agendamento no modo da casa usa a sessão e não o createdBy do pedido", () => {
  const writes = read("lib/casa/writes.ts");
  const directory = read("lib/attendance/directory.ts");
  const route = read("app/api/casa/appointments/route.ts");
  assert.match(writes, /export async function createAppointmentCasa/);
  assert.match(writes, /created_by, status/);
  assert.doesNotMatch(writes, /input\.createdBy/);
  assert.match(directory, /createAppointmentCasa\(/);
  assert.match(directory, /supabase: SupabaseClient \| null/);
  assert.match(route, /status: 401/);
  assert.match(route, /status: 404/);
  assert.match(route, /appointment_set_status/);
  assert.doesNotMatch(route, /createdBy: uuid/);
  assert.match(route, /createdBy: row\.created_by/);
});

test("a ficha não ganha exclusão física", () => {
  const writes = read("lib/casa/writes.ts");
  assert.match(writes, /export async function upsertPatientClinicalCasa/);
  assert.doesNotMatch(writes, /delete from public\.patient_clinical_data/);
  assert.doesNotMatch(writes, /input\.updatedBy/);
});

test("o formulário da agenda abre sem o cliente Supabase", () => {
  const page = read("components/attendance/AgendaPage.tsx");
  const form = read("components/attendance/AppointmentForm.tsx");
  assert.match(page, /showForm && \(supabase \|\| casa\)/);
  assert.match(form, /supabase: SupabaseClient \| null/);
  assert.match(form, /searchPatientsCasa/);
});
