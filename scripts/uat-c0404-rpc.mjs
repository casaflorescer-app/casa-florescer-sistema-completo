/**
 * UAT RPC C040.4 — requer fixture UAT-C0404 já criada.
 * Env: UAT_B34_PASSWORD, UAT_C0404_ENCOUNTER_ID, UAT_C0404_PATIENT_ID
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MARKER = "UAT-C0404";
const CASA = "7673bc0e-a789-4edd-b32f-392e407cc062";
const PHYS_A = "uat.b34.physician.a@exemplo.local";
const PHYS_B = "teste.b3.medica.b@exemplo.local";
const SECRETARY = "teste.b3.secretaria.com@exemplo.local";
const PATIENT = "uat.b34.patient@exemplo.local";

function readEnv(name) {
  const line = readFileSync(resolve(".env.local"), "utf8")
    .split(/\r?\n/)
    .find((item) => item.startsWith(name + "="));
  if (!line) throw new Error("missing " + name);
  return line.slice(name.length + 1).trim().replace(/^"|"$/g, "");
}

const url = readEnv("NEXT_PUBLIC_SUPABASE_URL");
const anon = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const password = process.env.UAT_B34_PASSWORD;
const encounter_id = process.env.UAT_C0404_ENCOUNTER_ID;
const patient_id = process.env.UAT_C0404_PATIENT_ID;
if (!password || !encounter_id || !patient_id) {
  throw new Error("UAT_B34_PASSWORD / UAT_C0404_ENCOUNTER_ID / UAT_C0404_PATIENT_ID required");
}

const results = [];
const pass = (n, d = "") => {
  results.push({ n, ok: true, d });
  console.log(`PASS — ${n}${d ? `: ${d}` : ""}`);
};
const fail = (n, d = "") => {
  results.push({ n, ok: false, d });
  console.log(`FAIL — ${n}${d ? `: ${d}` : ""}`);
};

function client() {
  return createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function login(email) {
  const sb = client();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`login ${email}: ${error?.message}`);
  return sb;
}

const sbA = await login(PHYS_A);
pass("login médica A");

const { data: cat, error: catErr } = await sbA.rpc("clinical_exam_catalog_upsert", {
  p_practice_id: CASA,
  p_name: `${MARKER} Hemograma`,
  p_category: "laboratorio",
  p_short_name: "HEM",
});
catErr ? fail("catalog upsert", catErr.message) : pass("catalog upsert");

const { data: cat2 } = await sbA.rpc("clinical_exam_catalog_upsert", {
  p_practice_id: CASA,
  p_name: `${MARKER} TSH`,
  p_category: "laboratorio",
});

const { data: group, error: gErr } = await sbA.rpc("clinical_exam_group_upsert", {
  p_practice_id: CASA,
  p_name: `${MARKER} Rotina`,
  p_catalog_ids: [cat?.id, cat2?.id].filter(Boolean),
});
gErr ? fail("group upsert", gErr.message) : pass("group upsert");

const { data: reqDraft, error: rErr } = await sbA.rpc("clinical_exam_request_create", {
  p_encounter_id: encounter_id,
  p_catalog_ids: [cat?.id].filter(Boolean),
  p_group_ids: [group?.id].filter(Boolean),
  p_custom_names: [`${MARKER} Exame avulso`],
  p_notes: `${MARKER} pedido`,
  p_confirm: false,
});
rErr ? fail("exam request draft", rErr.message) : pass("exam request draft", reqDraft?.status);

const { data: reqConf, error: cErr } = await sbA.rpc("clinical_exam_request_confirm", {
  p_request_id: reqDraft?.id,
});
cErr ? fail("exam request confirm", cErr.message) : pass("exam request confirm", reqConf?.status);

const { data: tpl, error: tErr } = await sbA.rpc("prescription_template_upsert", {
  p_practice_id: CASA,
  p_name: `${MARKER} Modelo`,
  p_items: [{ medication_name: `${MARKER} Med A`, dosage: "1 cp", frequency: "12/12h", duration: "5d" }],
});
tErr ? fail("prescription template", tErr.message) : pass("prescription template");

const { data: rx, error: rxErr } = await sbA.rpc("prescription_template_apply", {
  p_template_id: tpl?.id,
  p_encounter_id: encounter_id,
});
rxErr ? fail("template apply", rxErr.message) : pass("template apply", rx?.status);

const { data: aiReq, error: aiErr } = await sbA.rpc("ai_assistance_request_create", {
  p_encounter_id: encounter_id,
  p_suggestion_type: "soap",
  p_context_fingerprint: `${MARKER}:soap`,
});
aiErr ? fail("ai request", aiErr.message) : pass("ai request");

const payload = {
  summary: `${MARKER} resumo`,
  facts: ["fato"],
  missing_information: [],
  soap_suggestion: { subjective: "S", objective: "O", assessment: "A", plan: "P" },
  followup_questions: [],
  exam_suggestions: [],
  treatment_hints: [],
  warnings: ["SIMULAÇÃO — Sugestão gerada por IA"],
};

const { data: aiRes, error: saveErr } = await sbA.rpc("ai_assistance_save_result", {
  p_request_id: aiReq?.id,
  p_status: "available",
  p_provider: "dev-mock",
  p_model: "uat",
  p_payload: payload,
  p_is_simulation: true,
});
saveErr ? fail("ai save", saveErr.message) : pass("ai save", `v${aiRes?.version}`);

const { data: aiReq2 } = await sbA.rpc("ai_assistance_request_create", {
  p_encounter_id: encounter_id,
  p_suggestion_type: "summary",
});
const { data: aiRes2 } = await sbA.rpc("ai_assistance_save_result", {
  p_request_id: aiReq2?.id,
  p_status: "available",
  p_provider: "dev-mock",
  p_payload: payload,
  p_is_simulation: true,
});
const { error: rejErr } = await sbA.rpc("ai_assistance_review", {
  p_result_id: aiRes2?.id,
  p_action: "reject",
});
rejErr ? fail("ai reject", rejErr.message) : pass("ai reject");

const { error: accErr } = await sbA.rpc("ai_assistance_review", {
  p_result_id: aiRes?.id,
  p_action: "edit_accept",
  p_reviewed_payload: { ...payload, summary: `${MARKER} editado` },
});
accErr ? fail("ai edit_accept", accErr.message) : pass("ai edit_accept");

const { data: notes } = await sbA.from("clinical_notes").select("id").eq("encounter_id", encounter_id);
(notes ?? []).length === 0
  ? pass("IA não gravou clinical_notes")
  : fail("IA não gravou clinical_notes", String(notes.length));

const { data: aiReq3 } = await sbA.rpc("ai_assistance_request_create", {
  p_encounter_id: encounter_id,
  p_suggestion_type: "missing_info",
});
const { error: unErr } = await sbA.rpc("ai_assistance_save_result", {
  p_request_id: aiReq3?.id,
  p_status: "unavailable",
  p_provider: "unavailable",
  p_error_message: "Auxílio de IA indisponível.",
});
unErr ? fail("ai unavailable", unErr.message) : pass("ai unavailable");

const sbB = await login(PHYS_B);
const { error: forbidCat } = await sbB.rpc("clinical_exam_catalog_upsert", {
  p_practice_id: CASA,
  p_name: `${MARKER} FORBIDDEN`,
});
forbidCat && /FORBIDDEN/i.test(forbidCat.message)
  ? pass("médica B catalog FORBIDDEN")
  : fail("médica B catalog FORBIDDEN", forbidCat?.message ?? "allowed");

const { error: forbidAi } = await sbB.rpc("ai_assistance_request_create", {
  p_encounter_id: encounter_id,
  p_suggestion_type: "soap",
});
forbidAi && /FORBIDDEN|OWNER|NOT_FOUND/i.test(forbidAi.message)
  ? pass("médica B AI FORBIDDEN")
  : fail("médica B AI FORBIDDEN", forbidAi?.message ?? "allowed");

const sbS = await login(SECRETARY);
const { data: secRows, error: secSel } = await sbS
  .from("ai_assistance_results")
  .select("id")
  .eq("encounter_id", encounter_id);
(!secRows || secRows.length === 0)
  ? pass("secretária sem AI results")
  : fail("secretária sem AI results", String(secRows.length));
const { error: secRpc } = await sbS.rpc("ai_assistance_request_create", {
  p_encounter_id: encounter_id,
  p_suggestion_type: "soap",
});
secRpc && /FORBIDDEN|OWNER/i.test(secRpc.message)
  ? pass("secretária AI FORBIDDEN")
  : fail("secretária AI FORBIDDEN", secRpc?.message ?? "allowed");

const sbP = await login(PATIENT);
const { data: patNotes } = await sbP.from("clinical_notes").select("id").eq("encounter_id", encounter_id);
(!patNotes || patNotes.length === 0) ? pass("paciente sem SOAP") : fail("paciente sem SOAP", String(patNotes.length));

const sbAnon = client();
const { error: anonErr } = await sbAnon.rpc("ai_assistance_request_create", {
  p_encounter_id: encounter_id,
  p_suggestion_type: "soap",
});
anonErr ? pass("anônimo bloqueado") : fail("anônimo bloqueado", "allowed");

const failed = results.filter((r) => !r.ok);
console.log(`\nRPC UAT: ${results.length - failed.length}/${results.length} PASS`);
if (failed.length) {
  console.error(failed.map((f) => `${f.n}: ${f.d}`).join(" | "));
  process.exitCode = 1;
}
