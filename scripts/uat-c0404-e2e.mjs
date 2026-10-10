/**
 * UAT E2E C040.4 — massa marcada UAT-C0404, limpeza ao final.
 * Usa login JWT (anon key) — não service role.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

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
if (!password || password.length < 12) throw new Error("UAT_B34_PASSWORD ausente");

const results = [];
function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`PASS — ${name}${detail ? `: ${detail}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.log(`FAIL — ${name}${detail ? `: ${detail}` : ""}`);
}

function client() {
  return createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function login(email) {
  const sb = client();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`login ${email}: ${error?.message ?? "no session"}`);
  return sb;
}

function dbQuery(sql) {
  const file = resolve(process.env.TEMP || "/tmp", "cf-uat-c0404.sql");
  writeFileSync(file, sql, "utf8");
  const cmd = `npx.cmd supabase db query --linked -f "${file}"`;
  const out = spawnSync(cmd, {
    encoding: "utf8",
    shell: true,
    cwd: process.cwd(),
  });
  const text = `${out.stdout || ""}\n${out.stderr || ""}`;
  if (out.error) {
    throw new Error(`db query spawn error: ${out.error.message}`);
  }
  if (out.status !== 0 && !/"rows"\s*:/.test(text) && !/NOTICE:/.test(text) && !/Finished/.test(text)) {
    throw new Error(`db query failed (${out.status}): ${text.slice(0, 1200)}`);
  }
  // DO blocks may return empty rows but succeed
  if (out.status !== 0 && /ERROR:|error:/.test(text)) {
    throw new Error(`db query failed (${out.status}): ${text.slice(0, 1200)}`);
  }
  return text;
}

async function main() {
  // --- Fixture privileged ---
  const fixtureOut = dbQuery(`
do $$
declare
  v_org uuid := '22e69ed4-0797-4742-b00e-f625317c6931';
  v_practice uuid := '${CASA}';
  v_prof uuid;
  v_patient uuid;
  v_room uuid;
  v_appt uuid;
  v_enc uuid;
  v_actor uuid;
begin
  select id into v_actor from public.profiles where email = '${PHYS_A}' limit 1;
  select id into v_prof from public.professionals where practice_id = v_practice and profile_id = v_actor limit 1;
  select id into v_room from public.rooms where organization_id = v_org and status = 'active' order by name limit 1;

  if v_actor is null or v_prof is null or v_room is null then
    raise exception 'FIXTURE_PREREQ_MISSING actor=% prof=% room=%', v_actor, v_prof, v_room;
  end if;

  insert into public.patients (organization_id, full_name, created_by)
  values (v_org, '${MARKER} Paciente', v_actor)
  returning id into v_patient;

  insert into public.appointments (
    organization_id, practice_id, room_id, patient_id, professional_id,
    kind, starts_at, ends_at, urgency_note, source, created_by, status
  ) values (
    v_org, v_practice, v_room, v_patient, v_prof,
    'consultation', now() + interval '1 hour', now() + interval '1 hour 30 minutes',
    '${MARKER}', 'reception', v_actor, 'scheduled'
  ) returning id into v_appt;

  insert into public.encounters (
    organization_id, practice_id, patient_id, professional_id, appointment_id, status
  ) values (
    v_org, v_practice, v_patient, v_prof, v_appt, 'open'
  ) returning id into v_enc;

  raise notice 'FIXTURE patient=% appt=% enc=% prof=%', v_patient, v_appt, v_enc, v_prof;
end $$;
`);
  pass("fixture criada", "SQL DO");

  const idsRaw = dbQuery(`
select json_build_object(
  'patient_id', (select id::text from public.patients where full_name = '${MARKER} Paciente' order by created_at desc limit 1),
  'encounter_id', (select e.id::text from public.encounters e join public.appointments a on a.id = e.appointment_id where a.urgency_note = '${MARKER}' order by e.created_at desc limit 1),
  'professional_id', (select pr.id::text from public.professionals pr join public.profiles p on p.id = pr.profile_id where p.email = '${PHYS_A}' and pr.practice_id = '${CASA}' limit 1),
  'organization_id', '22e69ed4-0797-4742-b00e-f625317c6931'
)::text as payload;
`);
  let ids;
  try {
    const rowMatch = idsRaw.match(/"payload":\s*"((?:\\.|[^"\\])*)"/);
    if (rowMatch) {
      ids = JSON.parse(rowMatch[1].replace(/\\"/g, '"'));
    } else {
      throw new Error("ids not found in: " + idsRaw.slice(0, 400));
    }
  } catch (e) {
    fail("parse fixture ids", String(e));
    throw e;
  }

  const { patient_id, encounter_id, professional_id, organization_id } = ids;
  if (!patient_id || !encounter_id) throw new Error("fixture ids incompletos: " + JSON.stringify(ids));
  pass("fixture ids", `enc=${encounter_id.slice(0, 8)}…`);

  // --- Physician A happy path ---
  const sbA = await login(PHYS_A);
  pass("login médica A");

  const { data: cat, error: catErr } = await sbA.rpc("clinical_exam_catalog_upsert", {
    p_practice_id: CASA,
    p_name: `${MARKER} Hemograma`,
    p_category: "laboratorio",
    p_short_name: "HEM",
  });
  if (catErr) fail("catalog upsert", catErr.message);
  else pass("catalog upsert", cat?.id?.slice(0, 8));

  const { data: cat2 } = await sbA.rpc("clinical_exam_catalog_upsert", {
    p_practice_id: CASA,
    p_name: `${MARKER} TSH`,
    p_category: "laboratorio",
  });

  const { data: group, error: gErr } = await sbA.rpc("clinical_exam_group_upsert", {
    p_practice_id: CASA,
    p_name: `${MARKER} Rotina`,
    p_description: "Grupo UAT",
    p_catalog_ids: [cat?.id, cat2?.id].filter(Boolean),
  });
  if (gErr) fail("group upsert", gErr.message);
  else pass("group upsert", group?.id?.slice(0, 8));

  const { data: reqDraft, error: rErr } = await sbA.rpc("clinical_exam_request_create", {
    p_encounter_id: encounter_id,
    p_catalog_ids: [cat?.id].filter(Boolean),
    p_group_ids: [group?.id].filter(Boolean),
    p_custom_names: [`${MARKER} Exame avulso`],
    p_notes: `${MARKER} pedido`,
    p_confirm: false,
  });
  if (rErr) fail("exam request draft", rErr.message);
  else pass("exam request draft", reqDraft?.status);

  const { data: reqConf, error: cErr } = await sbA.rpc("clinical_exam_request_confirm", {
    p_request_id: reqDraft?.id,
  });
  if (cErr) fail("exam request confirm", cErr.message);
  else pass("exam request confirm", reqConf?.status);

  const { data: tpl, error: tErr } = await sbA.rpc("prescription_template_upsert", {
    p_practice_id: CASA,
    p_name: `${MARKER} Modelo`,
    p_description: "atalho UAT",
    p_items: [
      {
        medication_name: `${MARKER} Med A`,
        dosage: "1 cp",
        frequency: "12/12h",
        duration: "5 dias",
      },
    ],
  });
  if (tErr) fail("prescription template", tErr.message);
  else pass("prescription template", tpl?.id?.slice(0, 8));

  const { data: rx, error: rxErr } = await sbA.rpc("prescription_template_apply", {
    p_template_id: tpl?.id,
    p_encounter_id: encounter_id,
  });
  if (rxErr) fail("template apply copy", rxErr.message);
  else pass("template apply copy", rx?.status);

  // AI request create + save simulated result + review accept/reject
  const { data: aiReq, error: aiErr } = await sbA.rpc("ai_assistance_request_create", {
    p_encounter_id: encounter_id,
    p_suggestion_type: "soap",
    p_context_fingerprint: `${MARKER}:soap`,
  });
  if (aiErr) fail("ai request create", aiErr.message);
  else pass("ai request create", aiReq?.status);

  const payload = {
    summary: `${MARKER} resumo simulado`,
    facts: ["fato UAT"],
    missing_information: [],
    soap_suggestion: {
      subjective: `${MARKER} S`,
      objective: `${MARKER} O`,
      assessment: "Avaliação a critério da médica",
      plan: "Plano a critério da médica",
    },
    followup_questions: ["Pergunta UAT?"],
    exam_suggestions: [],
    treatment_hints: [],
    warnings: ["SIMULAÇÃO — Sugestão gerada por IA"],
  };

  const { data: aiRes, error: saveErr } = await sbA.rpc("ai_assistance_save_result", {
    p_request_id: aiReq?.id,
    p_status: "available",
    p_provider: "dev-mock",
    p_model: "uat-c0404",
    p_payload: payload,
    p_is_simulation: true,
  });
  if (saveErr) fail("ai save result", saveErr.message);
  else pass("ai save result", `v${aiRes?.version}`);

  // Reject path
  const { data: aiReq2 } = await sbA.rpc("ai_assistance_request_create", {
    p_encounter_id: encounter_id,
    p_suggestion_type: "summary",
  });
  const { data: aiRes2 } = await sbA.rpc("ai_assistance_save_result", {
    p_request_id: aiReq2?.id,
    p_status: "available",
    p_provider: "dev-mock",
    p_model: "uat-c0404",
    p_payload: { ...payload, summary: `${MARKER} reject` },
    p_is_simulation: true,
  });
  const { error: rejErr } = await sbA.rpc("ai_assistance_review", {
    p_result_id: aiRes2?.id,
    p_action: "reject",
  });
  if (rejErr) fail("ai reject", rejErr.message);
  else pass("ai reject");

  const { error: accErr } = await sbA.rpc("ai_assistance_review", {
    p_result_id: aiRes?.id,
    p_action: "edit_accept",
    p_reviewed_payload: { ...payload, summary: `${MARKER} editado` },
  });
  if (accErr) fail("ai edit_accept", accErr.message);
  else pass("ai edit_accept");

  // Confirm AI did not auto-write clinical notes
  const { data: notes } = await sbA
    .from("clinical_notes")
    .select("id, template_code")
    .eq("encounter_id", encounter_id);
  if ((notes ?? []).length === 0) pass("IA não gravou clinical_notes automaticamente");
  else fail("IA não gravou clinical_notes automaticamente", `found ${notes.length}`);

  // Unavailable path via API-less: save unavailable
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
  if (unErr) fail("ai unavailable status", unErr.message);
  else pass("ai unavailable status");

  // --- Security: physician B ---
  const sbB = await login(PHYS_B);
  const { error: forbidCat } = await sbB.rpc("clinical_exam_catalog_upsert", {
    p_practice_id: CASA,
    p_name: `${MARKER} FORBIDDEN`,
  });
  if (forbidCat && /FORBIDDEN|PRACTICE/i.test(forbidCat.message)) pass("médica B catalog FORBIDDEN");
  else fail("médica B catalog FORBIDDEN", forbidCat?.message ?? "allowed");

  const { error: forbidAi } = await sbB.rpc("ai_assistance_request_create", {
    p_encounter_id: encounter_id,
    p_suggestion_type: "soap",
  });
  if (forbidAi && /FORBIDDEN|OWNER|NOT_FOUND/i.test(forbidAi.message)) pass("médica B AI FORBIDDEN");
  else fail("médica B AI FORBIDDEN", forbidAi?.message ?? "allowed");

  // --- Secretary ---
  const sbS = await login(SECRETARY);
  const { data: secSelect, error: secErr } = await sbS
    .from("ai_assistance_results")
    .select("id")
    .eq("encounter_id", encounter_id);
  if ((!secSelect || secSelect.length === 0) && !secErr) pass("secretária sem resultados IA");
  else if (secErr) pass("secretária bloqueada leitura IA", secErr.message);
  else fail("secretária sem resultados IA", `rows=${secSelect.length}`);

  const { error: secRpc } = await sbS.rpc("ai_assistance_request_create", {
    p_encounter_id: encounter_id,
    p_suggestion_type: "soap",
  });
  if (secRpc && /FORBIDDEN|OWNER/i.test(secRpc.message)) pass("secretária AI FORBIDDEN");
  else fail("secretária AI FORBIDDEN", secRpc?.message ?? "allowed");

  // --- Patient ---
  const sbP = await login(PATIENT);
  const { data: patSoap } = await sbP
    .from("clinical_notes")
    .select("id")
    .eq("encounter_id", encounter_id);
  if (!patSoap || patSoap.length === 0) pass("paciente sem SOAP");
  else fail("paciente sem SOAP", `rows=${patSoap.length}`);

  // --- Anonymous ---
  const sbAnon = client();
  const { error: anonErr } = await sbAnon.rpc("ai_assistance_request_create", {
    p_encounter_id: encounter_id,
    p_suggestion_type: "soap",
  });
  if (anonErr) pass("anônimo bloqueado", anonErr.message.slice(0, 60));
  else fail("anônimo bloqueado", "RPC succeeded");

  // --- Signed encounter immutability ---
  await login(PHYS_A);
  // reopen sbA session
  const sbA2 = await login(PHYS_A);
  // use privileged to sign encounter for test
  dbQuery(`
update public.encounters
   set status = 'signed', signed_at = now(), signed_by = (select id from public.profiles where email='${PHYS_A}')
 where id = '${encounter_id}'::uuid;
`);
  const { error: signedAi } = await sbA2.rpc("ai_assistance_request_create", {
    p_encounter_id: encounter_id,
    p_suggestion_type: "soap",
  });
  if (signedAi && /ENCOUNTER_NOT_OPEN/i.test(signedAi.message)) pass("encounter assinado bloqueia IA");
  else fail("encounter assinado bloqueia IA", signedAi?.message ?? "allowed");

  // --- Cleanup ---
  const cleanupOut = dbQuery(`
do $$
declare
  v_enc uuid;
  v_patient uuid;
  v_appt uuid;
begin
  select e.id, e.patient_id, e.appointment_id
    into v_enc, v_patient, v_appt
  from public.encounters e
  join public.appointments a on a.id = e.appointment_id
  where a.urgency_note = '${MARKER}'
  order by e.opened_at desc
  limit 1;

  delete from public.ai_assistance_results where encounter_id = v_enc;
  delete from public.ai_assistance_requests where encounter_id = v_enc;
  delete from public.clinical_exam_request_items where request_id in (
    select id from public.clinical_exam_requests where encounter_id = v_enc
  );
  delete from public.clinical_exam_requests where encounter_id = v_enc;
  delete from public.prescription_items where prescription_id in (
    select id from public.prescriptions where encounter_id = v_enc
  );
  delete from public.prescriptions where encounter_id = v_enc;
  delete from public.clinical_notes where encounter_id = v_enc;
  delete from public.encounters where id = v_enc;
  delete from public.appointments where id = v_appt;
  delete from public.patients where id = v_patient;

  delete from public.clinical_exam_group_items where group_id in (
    select id from public.clinical_exam_groups where name like '${MARKER}%'
  );
  delete from public.clinical_exam_groups where name like '${MARKER}%';
  delete from public.clinical_exam_catalog where name like '${MARKER}%';
  delete from public.prescription_template_items where template_id in (
    select id from public.prescription_templates where name like '${MARKER}%'
  );
  delete from public.prescription_templates where name like '${MARKER}%';
end $$;
`);
  pass("cleanup executado");

  const left = dbQuery(`
select json_build_object(
  'patients', (select count(*) from public.patients where full_name like '${MARKER}%'),
  'encounters', (select count(*) from public.encounters e join public.appointments a on a.id=e.appointment_id where a.urgency_note='${MARKER}'),
  'ai_req', (select count(*) from public.ai_assistance_requests where context_fingerprint like '${MARKER}%'),
  'ai_res', (select count(*) from public.ai_assistance_results where payload::text like '%${MARKER}%'),
  'exam_req', (select count(*) from public.clinical_exam_requests where notes like '${MARKER}%'),
  'catalog', (select count(*) from public.clinical_exam_catalog where name like '${MARKER}%'),
  'groups', (select count(*) from public.clinical_exam_groups where name like '${MARKER}%'),
  'templates', (select count(*) from public.prescription_templates where name like '${MARKER}%'),
  'rx', (select count(*) from public.prescriptions p join public.prescription_items i on i.prescription_id=p.id where i.medication_name like '${MARKER}%')
)::text as left_counts;
`);
  const leftMatch = left.match(/"left_counts":\s*"((?:\\.|[^"\\])*)"/);
  let leftObj = {};
  if (leftMatch) leftObj = JSON.parse(leftMatch[1].replace(/\\"/g, '"'));
  const uatLeft = Object.values(leftObj).reduce((a, b) => a + Number(b || 0), 0);
  if (uatLeft === 0) pass("uat_left = 0", JSON.stringify(leftObj));
  else fail("uat_left = 0", JSON.stringify(leftObj));

  // Agenda 29/09
  const agenda = dbQuery(`
select count(*)::int as n
from public.appointments
where practice_id = '${CASA}'
  and starts_at >= '2026-09-29 00:00:00-03'
  and starts_at < '2026-09-30 00:00:00-03'
  and status is distinct from 'cancelled';
`);
  const nMatch = agenda.match(/"n"\s*:\s*(\d+)/);
  const n = nMatch ? Number(nMatch[1]) : -1;
  if (n === 10) pass("agenda 29/09/2026 = 10");
  else fail("agenda 29/09/2026 = 10", `got ${n}`);

  const failed = results.filter((r) => !r.ok);
  console.log(`\nE2E C040.4: ${results.length - failed.length}/${results.length} PASS`);
  if (failed.length) {
    console.error("Falhas:", failed.map((f) => f.name + " — " + f.detail).join(" | "));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("FATAL", err);
  try {
    dbQuery(`
delete from public.ai_assistance_results where encounter_id in (
  select e.id from public.encounters e join public.appointments a on a.id=e.appointment_id where a.urgency_note='${MARKER}'
);
delete from public.ai_assistance_requests where encounter_id in (
  select e.id from public.encounters e join public.appointments a on a.id=e.appointment_id where a.urgency_note='${MARKER}'
);
delete from public.clinical_exam_request_items where request_id in (
  select r.id from public.clinical_exam_requests r join public.encounters e on e.id=r.encounter_id
  join public.appointments a on a.id=e.appointment_id where a.urgency_note='${MARKER}'
);
delete from public.clinical_exam_requests where encounter_id in (
  select e.id from public.encounters e join public.appointments a on a.id=e.appointment_id where a.urgency_note='${MARKER}'
);
delete from public.prescription_items where prescription_id in (
  select p.id from public.prescriptions p join public.encounters e on e.id=p.encounter_id
  join public.appointments a on a.id=e.appointment_id where a.urgency_note='${MARKER}'
);
delete from public.prescriptions where encounter_id in (
  select e.id from public.encounters e join public.appointments a on a.id=e.appointment_id where a.urgency_note='${MARKER}'
);
delete from public.encounters where appointment_id in (select id from public.appointments where urgency_note='${MARKER}');
delete from public.appointments where urgency_note='${MARKER}';
delete from public.patients where full_name like '${MARKER}%';
delete from public.clinical_exam_group_items where group_id in (select id from public.clinical_exam_groups where name like '${MARKER}%');
delete from public.clinical_exam_groups where name like '${MARKER}%';
delete from public.clinical_exam_catalog where name like '${MARKER}%';
delete from public.prescription_template_items where template_id in (select id from public.prescription_templates where name like '${MARKER}%');
delete from public.prescription_templates where name like '${MARKER}%';
`);
    console.error("cleanup de emergência executado");
  } catch (e) {
    console.error("cleanup de emergência falhou", e);
  }
  process.exitCode = 1;
});
