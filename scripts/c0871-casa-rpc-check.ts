import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { clinicalDownloadAllowed, safeRelativePath } from "../lib/files/casa-path.ts";

const source = readFileSync(new URL("../lib/casa/rpc.ts", import.meta.url), "utf8");

function listed(name: string, arity: number) {
  return source.includes(`${name}: ${arity},`) || source.includes(`${name}: ${arity}\n`);
}

test("as funções novas entram só com a aridade já revogada", () => {
  assert.equal(listed("clinical_note_upsert", 3), true);
  assert.equal(listed("encounter_recording_register_segment", 5), true);
  assert.equal(listed("encounter_recording_mark_segment_uploaded", 3), true);
  assert.equal(listed("ai_assistance_save_result", 7), true);
  assert.equal(listed("ai_assistance_review", 3), true);
  assert.equal(listed("encounter_patient_feedback_upsert", 4), true);
  assert.equal(listed("patient_portal_feedback_targets", 0), true);
  assert.equal(listed("publish_professional_care_policy_version", 7), true);
  assert.equal(listed("grant_system_admin", 2), true);
  assert.equal(listed("grant_system_admin", 1), false);
  assert.equal(listed("funcao_inexistente", 1), false);
});

test("gravação clínica recusa caminho diferente do gravado", () => {
  const stored = "org/paciente/atendimento/sessao/segmento/audio";
  assert.equal(safeRelativePath(`${stored}/../outro`), null);
  assert.equal(clinicalDownloadAllowed({ requested: stored, stored, canRead: true }), true);
  assert.equal(
    clinicalDownloadAllowed({ requested: "org/paciente/outro/audio", stored, canRead: true }),
    false,
  );
  assert.equal(clinicalDownloadAllowed({ requested: stored, stored, canRead: false }), false);
});
