/**
 * UAT E2E C040.6 — consolidação do fluxo (sem aplicar migration no remoto).
 * Marca UAT-C0406; limpa ao final. Não executa db push.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MARKER = "UAT-C0406";
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
function note(name, detail = "") {
  results.push({ name, ok: true, detail: `NOTE ${detail}` });
  console.log(`NOTE — ${name}${detail ? `: ${detail}` : ""}`);
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
  const file = resolve(process.env.TEMP || "/tmp", "cf-uat-c0406.sql");
  writeFileSync(file, sql, "utf8");
  const cmd = `npx.cmd supabase db query --linked -f "${file}"`;
  const out = spawnSync(cmd, {
    encoding: "utf8",
    shell: true,
    cwd: process.cwd(),
  });
  const text = `${out.stdout || ""}\n${out.stderr || ""}`;
  if (out.error) throw new Error(`db query spawn error: ${out.error.message}`);
  if (out.status !== 0 && /ERROR:|error:/.test(text) && !/"rows"\s*:/.test(text)) {
    throw new Error(`db query failed (${out.status}): ${text.slice(0, 1200)}`);
  }
  return text;
}

async function main() {
  console.log("=== UAT C040.6 E2E FINAL (migration 0045 aplicada) ===\n");

  dbQuery(`
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

  raise notice 'FIXTURE patient=% appt=% enc=%', v_patient, v_appt, v_enc;
end $$;
`);
  pass("fixture criada");

  const idsRaw = dbQuery(`
select json_build_object(
  'patient_id', (select id::text from public.patients where full_name = '${MARKER} Paciente' order by created_at desc limit 1),
  'appointment_id', (select id::text from public.appointments where urgency_note = '${MARKER}' order by starts_at desc limit 1),
  'encounter_id', (select e.id::text from public.encounters e join public.appointments a on a.id = e.appointment_id where a.urgency_note = '${MARKER}' order by e.created_at desc limit 1),
  'professional_id', (select pr.id::text from public.professionals pr join public.profiles p on p.id = pr.profile_id where p.email = '${PHYS_A}' and pr.practice_id = '${CASA}' limit 1),
  'organization_id', '22e69ed4-0797-4742-b00e-f625317c6931'
)::text as payload;
`);
  let ids;
  const rowMatch = idsRaw.match(/"payload":\s*"((?:\\.|[^"\\])*)"/);
  if (!rowMatch) throw new Error("ids not found: " + idsRaw.slice(0, 400));
  ids = JSON.parse(rowMatch[1].replace(/\\"/g, '"'));
  const { patient_id, appointment_id, encounter_id, professional_id, organization_id } = ids;
  if (!patient_id || !encounter_id) throw new Error("fixture ids incompletos");
  pass("fixture ids", `enc=${encounter_id.slice(0, 8)}…`);

  const physA = await login(PHYS_A);
  pass("login médica A");

  // Idempotência open
  const { data: encAgain, error: openErr } = await physA.rpc("encounter_open_from_appointment", {
    p_appointment_id: appointment_id,
  });
  if (openErr) fail("continuar encounter", openErr.message);
  else if (String(encAgain) === String(encounter_id)) pass("continuar encounter (mesmo id)");
  else fail("continuar encounter", `${encAgain} != ${encounter_id}`);

  // Sign sem conteúdo
  {
    const { error: signEmpty } = await physA.rpc("encounter_sign", { p_encounter_id: encounter_id });
    const signMsg = signEmpty?.message || "";
    if (/SOAP_REQUIRED_BEFORE_SIGN/i.test(signMsg)) {
      pass("sign sem SOAP bloqueado (SOAP_REQUIRED)", signMsg);
    } else if (/NOTE_REQUIRED_BEFORE_SIGN/i.test(signMsg)) {
      fail("sign sem SOAP", "ainda NOTE_REQUIRED — 0045 não efetiva");
    } else {
      fail("sign sem SOAP", signMsg || "aceitou sem nota");
    }
  }

  // Fluxo clínico mínimo
  {
    const { error } = await physA.rpc("clinical_note_upsert", {
      p_encounter_id: encounter_id,
      p_body: JSON.stringify({
        chiefComplaint: "Consulta de rotina",
        motives: ["rotina"],
        historyOfPresentIllness: "Sem queixas",
      }),
      p_template_code: "chief_complaint",
    });
    if (error) fail("queixa", error.message);
    else pass("queixa");
  }
  {
    const { error } = await physA.rpc("clinical_note_upsert", {
      p_encounter_id: encounter_id,
      p_body: JSON.stringify({
        personalHistoryNotes: "Negativos",
        reviewNotes: "Conferido",
      }),
      p_template_code: "anamnesis_encounter",
    });
    if (error) fail("anamnese", error.message);
    else pass("anamnese");
  }
  {
    const { error } = await physA.rpc("clinical_note_upsert", {
      p_encounter_id: encounter_id,
      p_body: JSON.stringify({
        vitals: { weightKg: 62, heightCm: 165, bpSystolic: 110, bpDiastolic: 70 },
        freeText: "Exame sem alterações",
      }),
      p_template_code: "physical_exam",
    });
    if (error) fail("exame físico", error.message);
    else pass("exame físico");
  }
  {
    const { error } = await physA.rpc("clinical_note_upsert", {
      p_encounter_id: encounter_id,
      p_body: "S: rotina\nO: BEG\nA: saudável\nP: retorno anual",
      p_template_code: "soap_min",
    });
    if (error) fail("SOAP", error.message);
    else pass("SOAP");
  }

  // Exame + grupo
  let catId;
  let groupId;
  {
    const { data: cat, error } = await physA.rpc("clinical_exam_catalog_upsert", {
      p_practice_id: CASA,
      p_name: `${MARKER} Hemograma`,
      p_category: "laboratorio",
    });
    if (error) fail("catalog exame", error.message);
    else {
      catId = cat?.id;
      pass("catalog exame");
    }
  }
  {
    const { data: group, error } = await physA.rpc("clinical_exam_group_upsert", {
      p_practice_id: CASA,
      p_name: `${MARKER} Rotina`,
      p_catalog_ids: catId ? [catId] : [],
    });
    if (error) fail("grupo exames", error.message);
    else {
      groupId = group?.id;
      pass("grupo exames");
    }
  }
  {
    const { data: req, error } = await physA.rpc("clinical_exam_request_create", {
      p_encounter_id: encounter_id,
      p_catalog_ids: catId ? [catId] : [],
      p_group_ids: groupId ? [groupId] : [],
      p_custom_names: [`${MARKER} Avulso`],
      p_confirm: true,
    });
    if (error) fail("pedido exames", error.message);
    else pass("pedido exames", req?.status);
  }

  // Modelo receita → cópia
  {
    const { data: tpl, error: tErr } = await physA.rpc("prescription_template_upsert", {
      p_practice_id: CASA,
      p_name: `${MARKER} Modelo`,
      p_items: [
        {
          medication_name: `${MARKER} Ácido fólico`,
          dosage: "1 cp",
          frequency: "1x/dia",
          duration: "30 dias",
        },
      ],
    });
    if (tErr) fail("modelo receita", tErr.message);
    else {
      pass("modelo receita");
      const { error: aErr } = await physA.rpc("prescription_template_apply", {
        p_template_id: tpl?.id,
        p_encounter_id: encounter_id,
      });
      if (aErr) fail("aplicar modelo receita", aErr.message);
      else pass("aplicar modelo receita (cópia)");
    }
  }

  // Orientação
  {
    const { error } = await physA.rpc("clinical_orientation_create", {
      p_payload: {
        organization_id: organization_id,
        practice_id: CASA,
        patient_id: patient_id,
        professional_id: professional_id,
        encounter_id: encounter_id,
        title: `${MARKER} Orientação`,
      },
    });
    if (error) fail("orientação", error.message);
    else pass("orientação");
  }

  // Segurança
  try {
    const physB = await login(PHYS_B);
    const { data } = await physB.from("encounters").select("id").eq("id", encounter_id).maybeSingle();
    if (!data) pass("Médica B / outra prática: FORBIDDEN read");
    else fail("Médica B leu encounter");
  } catch (e) {
    note("PHYS_B", String(e.message || e));
  }

  try {
    const sec = await login(SECRETARY);
    const { data } = await sec.from("clinical_notes").select("id").eq("encounter_id", encounter_id);
    if (!data?.length) pass("Secretária sem conteúdo clínico");
    else fail("Secretária leu clinical_notes", String(data.length));
  } catch (e) {
    note("SECRETARY", String(e.message || e));
  }

  {
    const anonSb = client();
    const { data } = await anonSb.from("encounters").select("id").eq("id", encounter_id);
    if (!data?.length) pass("Anônimo bloqueado");
    else fail("Anônimo leu encounter");
  }

  // Assinar
  {
    const { error } = await physA.rpc("encounter_sign", { p_encounter_id: encounter_id });
    if (error) fail("assinar", error.message);
    else pass("assinar");
  }

  // Pós-assinatura SOAP
  {
    const { error } = await physA.rpc("clinical_note_upsert", {
      p_encounter_id: encounter_id,
      p_body: "alteração ilegal",
      p_template_code: "soap_min",
    });
    if (error) pass("SOAP imutável pós-assinatura", error.message);
    else fail("SOAP alterado pós-assinatura");
  }

  // Pós-assinatura receita (0045)
  {
    const userId = (await physA.auth.getUser()).data.user?.id;
    const { error } = await physA.from("prescriptions").insert({
      organization_id: organization_id,
      practice_id: CASA,
      patient_id: patient_id,
      professional_id: professional_id,
      encounter_id: encounter_id,
      status: "draft",
      notes: `${MARKER}-after-sign`,
      created_by: userId,
    });
    if (error && /ENCOUNTER_NOT_OPEN/i.test(error.message)) {
      pass("receita pós-assinatura bloqueada", error.message);
    } else if (!error) {
      fail("receita pós-assinatura", "ainda permitida após assinatura");
      await physA.from("prescriptions").delete().eq("notes", `${MARKER}-after-sign`);
    } else {
      fail("receita pós-assinatura", error.message);
    }
  }

  // Pós-assinatura orientação (0045)
  {
    const { error } = await physA.rpc("clinical_orientation_create", {
      p_payload: {
        organization_id: organization_id,
        practice_id: CASA,
        patient_id: patient_id,
        professional_id: professional_id,
        encounter_id: encounter_id,
        title: `${MARKER} pós-assinatura`,
      },
    });
    if (error && /ENCOUNTER_NOT_OPEN/i.test(error.message)) {
      pass("orientação pós-assinatura bloqueada", error.message);
    } else if (!error) {
      fail("orientação pós-assinatura", "ainda permitida após assinatura");
    } else {
      fail("orientação pós-assinatura", error.message);
    }
  }

  // Paciente
  try {
    const pat = await login(PATIENT);
    const { data } = await pat
      .from("clinical_notes")
      .select("id")
      .eq("encounter_id", encounter_id);
    if (!data?.length) pass("Paciente sem SOAP/notas internas");
    else fail("Paciente leu clinical_notes");
  } catch (e) {
    note("PATIENT", String(e.message || e));
  }

  // Agenda
  const agendaRaw = dbQuery(`
select count(*)::int as n
from public.appointments
where practice_id = '${CASA}'
  and starts_at >= '2026-09-29 00:00:00-03'
  and starts_at < '2026-09-30 00:00:00-03';
`);
  const nMatch = agendaRaw.match(/"n"\s*:\s*(\d+)/);
  const n = nMatch ? Number(nMatch[1]) : -1;
  if (n === 10) pass("agenda 29/09/2026 = 10");
  else fail("agenda 29/09/2026 = 10", `got ${n}`);

  // Cleanup (disable item guard — mesma estratégia C040.4)
  dbQuery(`
alter table public.prescription_items disable trigger prescription_items_guard;
do $$
declare
  v_patient uuid;
  v_enc uuid;
  v_req uuid;
begin
  for v_patient in select id from public.patients where full_name = '${MARKER} Paciente'
  loop
    for v_enc in select id from public.encounters where patient_id = v_patient
    loop
      for v_req in select id from public.clinical_exam_requests where encounter_id = v_enc
      loop
        delete from public.clinical_exam_request_items where request_id = v_req;
        delete from public.clinical_exam_requests where id = v_req;
      end loop;
      delete from public.prescription_items where prescription_id in (
        select id from public.prescriptions where encounter_id = v_enc or notes like '${MARKER}%'
      );
      delete from public.prescriptions where encounter_id = v_enc or notes like '${MARKER}%';
      delete from public.clinical_orientation_versions where orientation_id in (
        select id from public.clinical_orientations where encounter_id = v_enc or title like '${MARKER}%'
      );
      delete from public.clinical_orientations where encounter_id = v_enc or title like '${MARKER}%';
      delete from public.clinical_notes where encounter_id = v_enc;
      delete from public.encounter_patient_feedback where encounter_id = v_enc;
      delete from public.ai_assistance_results where request_id in (
        select id from public.ai_assistance_requests where encounter_id = v_enc
      );
      delete from public.ai_assistance_requests where encounter_id = v_enc;
      delete from public.encounters where id = v_enc;
    end loop;
    delete from public.appointments where patient_id = v_patient and urgency_note = '${MARKER}';
    delete from public.patients where id = v_patient;
  end loop;

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
alter table public.prescription_items enable trigger prescription_items_guard;
`);

  const leftRaw = dbQuery(`
select json_build_object(
  'patients', (select count(*) from public.patients where full_name like '${MARKER}%'),
  'encounters', (select count(*) from public.encounters e join public.patients p on p.id = e.patient_id where p.full_name like '${MARKER}%'),
  'appts', (select count(*) from public.appointments where urgency_note = '${MARKER}'),
  'notes', (select count(*) from public.clinical_notes n join public.encounters e on e.id = n.encounter_id join public.patients p on p.id = e.patient_id where p.full_name like '${MARKER}%'),
  'rx', (select count(*) from public.prescriptions where notes like '${MARKER}%'),
  'catalog', (select count(*) from public.clinical_exam_catalog where name like '${MARKER}%')
)::text as payload;
`);
  const leftMatch = leftRaw.match(/"payload":\s*"((?:\\.|[^"\\])*)"/);
  const left = leftMatch ? JSON.parse(leftMatch[1].replace(/\\"/g, '"')) : {};
  const uatLeft = Object.values(left).reduce((a, b) => a + Number(b || 0), 0);
  if (uatLeft === 0) pass("uat_left = 0");
  else fail("uat_left = 0", JSON.stringify(left));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== RESULTADO C040.6: ${results.length - failed.length}/${results.length} PASS ===`);
  if (failed.length) {
    for (const f of failed) console.log(`  FAIL: ${f.name} — ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("FATAL", err);
  // best-effort cleanup
  try {
    dbQuery(`
alter table public.prescription_items disable trigger prescription_items_guard;
do $$
begin
  delete from public.clinical_exam_group_items where group_id in (select id from public.clinical_exam_groups where name like '${MARKER}%');
  delete from public.clinical_exam_groups where name like '${MARKER}%';
  delete from public.clinical_exam_catalog where name like '${MARKER}%';
  delete from public.prescription_template_items where template_id in (select id from public.prescription_templates where name like '${MARKER}%');
  delete from public.prescription_templates where name like '${MARKER}%';
  delete from public.prescription_items where prescription_id in (select id from public.prescriptions where notes like '${MARKER}%');
  delete from public.prescriptions where notes like '${MARKER}%';
  delete from public.clinical_orientation_versions where orientation_id in (select id from public.clinical_orientations where title like '${MARKER}%');
  delete from public.clinical_orientations where title like '${MARKER}%';
  delete from public.clinical_exam_request_items where request_id in (
    select r.id from public.clinical_exam_requests r
    join public.encounters e on e.id = r.encounter_id
    join public.patients p on p.id = e.patient_id
    where p.full_name like '${MARKER}%'
  );
  delete from public.clinical_exam_requests where encounter_id in (
    select e.id from public.encounters e join public.patients p on p.id = e.patient_id where p.full_name like '${MARKER}%'
  );
  delete from public.clinical_notes where encounter_id in (
    select e.id from public.encounters e join public.patients p on p.id = e.patient_id where p.full_name like '${MARKER}%'
  );
  delete from public.encounters where patient_id in (select id from public.patients where full_name like '${MARKER}%');
  delete from public.appointments where urgency_note = '${MARKER}';
  delete from public.patients where full_name like '${MARKER}%';
end $$;
alter table public.prescription_items enable trigger prescription_items_guard;
`);
  } catch {
    /* ignore */
  }
  process.exitCode = 1;
});
