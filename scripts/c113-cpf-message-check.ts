import assert from "node:assert/strict";
import test from "node:test";
import { PATIENT_CPF_TAKEN, patientWriteError } from "../lib/patients/patient-write-error.ts";

test("CPF repetido vira a frase operacional", () => {
  const err = Object.assign(new Error('duplicate key value violates unique constraint "patients_organization_id_cpf_key"'), {
    code: "23505",
  });
  const mapped = patientWriteError(err);
  assert.ok(mapped instanceof Error);
  assert.equal(mapped.message, PATIENT_CPF_TAKEN);
  assert.equal(mapped.message.includes("duplicate"), false);
});

test("outro erro permanece intacto", () => {
  const err = new Error("Não foi possível identificar o vínculo da sessão atual.");
  assert.equal(patientWriteError(err), err);
});
