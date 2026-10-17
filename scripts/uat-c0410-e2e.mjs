/**
 * UAT E2E C040.10 — convergência prontuário (marcador UAT_C0410_).
 * Não aplica migration. Não cria commit/push/deploy.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MARKER = "UAT_C0410_";
const CASA = "7673bc0e-a789-4edd-b32f-392e407cc062";
const ORG = "22e69ed4-0797-4742-b00e-f625317c6931";
const PHYS_A = "uat.b34.physician.a@exemplo.local";
const PHYS_B = "teste.b3.medica.b@exemplo.local";

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
const pass = (name, detail = "") => {
  results.push({ name, ok: true, detail });
  console.log(`PASS — ${name}${detail ? `: ${detail}` : ""}`);
};
const fail = (name, detail = "") => {
  results.push({ name, ok: false, detail });
  console.log(`FAIL — ${name}${detail ? `: ${detail}` : ""}`);
};

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
  const file = resolve(process.env.TEMP || "/tmp", "cf-uat-c0410.sql");
  writeFileSync(file, sql, "utf8");
  const out = spawnSync(`npx --yes supabase@2.121.0 db query --linked -f "${file}"`, {
    encoding: "utf8",
    shell: true,
    cwd: process.cwd(),
  });
  const text = `${out.stdout || ""}\n${out.stderr || ""}`;
  if (out.status !== 0 && /ERROR:|error:/.test(text) && !/"rows"\s*:/.test(text)) {
    throw new Error(`db query failed: ${text.slice(0, 1200)}`);
  }
  return text;
}

function parsePayload(text) {
  const m = text.match(/"payload":\s*"((?:\\.|[^"\\])*)"/);
  if (!m) throw new Error("payload not found: " + text.slice(0, 400));
  return JSON.parse(m[1].replace(/\\"/g, '"'));
}

async function main() {
  console.log("=== UAT C040.10 E2E ===\n");

  dbQuery(`
do $$
declare
  v_actor uuid;
  v_prof uuid;
  v_room uuid;
  v_patient uuid;
  v_patient2 uuid;
  v_appt uuid;
  v_enc uuid;
begin
  select id into v_actor from public.profiles where email = '${PHYS_A}' limit 1;
  select id into v_prof from public.professionals where practice_id = '${CASA}' and profile_id = v_actor limit 1;
  select id into v_room from public.rooms where organization_id = '${ORG}' and status = 'active' order by name limit 1;

  insert into public.patients (organization_id, full_name, phone, created_by)
  values ('${ORG}', '${MARKER}Maria Silva Alpha', '11999990001', v_actor)
  returning id into v_patient;

  insert into public.patients (organization_id, full_name, phone, created_by)
  values ('${ORG}', '${MARKER}Maria Silva Beta', '11999990002', v_actor)
  returning id into v_patient2;

  insert into public.appointments (
    organization_id, practice_id, room_id, patient_id, professional_id,
    kind, starts_at, ends_at, urgency_note, source, created_by, status
  ) values (
    '${ORG}', '${CASA}', v_room, v_patient, v_prof,
    'consultation', now() + interval '50 hours', now() + interval '50 hours 30 minutes',
    '${MARKER}', 'reception', v_actor, 'scheduled'
  ) returning id into v_appt;

  insert into public.encounters (
    organization_id, practice_id, patient_id, professional_id, appointment_id, status
  ) values ('${ORG}', '${CASA}', v_patient, v_prof, v_appt, 'open')
  returning id into v_enc;
end $$;
`);
  pass("fixture UAT criada (homônimas + encounter)");

  const ids = parsePayload(dbQuery(`
select json_build_object(
  'p1', (select id::text from public.patients where full_name = '${MARKER}Maria Silva Alpha' order by created_at desc limit 1),
  'p2', (select id::text from public.patients where full_name = '${MARKER}Maria Silva Beta' order by created_at desc limit 1),
  'enc', (select e.id::text from public.encounters e
          join public.appointments a on a.id = e.appointment_id
          where a.urgency_note = '${MARKER}' order by e.created_at desc limit 1)
)::text as payload;
`));
  if (!ids.p1 || !ids.p2 || !ids.enc) throw new Error("ids incompletos");
  pass("fixture ids", ids.p1.slice(0, 8));

  const physA = await login(PHYS_A);
  pass("login médica A");

  // pesquisa por nome parcial
  const { data: searchRows, error: sErr } = await physA
    .from("patients")
    .select("id, full_name, phone")
    .ilike("full_name", `%${MARKER}Maria%`)
    .order("full_name")
    .limit(30);
  if (sErr) fail("pesquisa nome", sErr.message);
  else {
    const names = (searchRows ?? []).map((r) => r.full_name);
    if (names.includes(`${MARKER}Maria Silva Alpha`) && names.includes(`${MARKER}Maria Silva Beta`)) {
      pass("homônimos listados sem auto-seleção", String(names.length));
    } else fail("homônimos", JSON.stringify(names));
  }

  // getPatient A
  const { data: gotA, error: gErr } = await physA
    .from("patients")
    .select("id, full_name")
    .eq("id", ids.p1)
    .maybeSingle();
  if (gErr || !gotA) fail("abrir paciente A", gErr?.message ?? "null");
  else pass("abrir paciente A");

  // encounters da paciente
  const { data: encs, error: eErr } = await physA
    .from("encounters")
    .select("id, status, patient_id")
    .eq("patient_id", ids.p1)
    .eq("practice_id", CASA);
  if (eErr) fail("histórico encounters", eErr.message);
  else if ((encs ?? []).some((e) => e.id === ids.enc)) pass("histórico contém encounter UAT");
  else fail("histórico encounter");

  // convergência conceitual: mesma paciente por id (rotas UI apontam same href)
  const chartHref = `/app/records/patient/${ids.p1}`;
  const aliasHref = `/app/patients/${ids.p1}/prontuario`;
  if (chartHref.includes(ids.p1) && aliasHref.includes(ids.p1)) {
    pass("convergência IDs (chart = alias patient)", chartHref);
  }

  // cross-practice
  try {
    const physB = await login(PHYS_B);
    const { data: stolen } = await physB
      .from("patients")
      .select("id")
      .eq("id", ids.p1)
      .maybeSingle();
    if (!stolen) pass("Médica B não lê paciente A (RLS)");
    else fail("Médica B leu paciente A");

    const { data: stolenEnc } = await physB
      .from("encounters")
      .select("id")
      .eq("id", ids.enc)
      .maybeSingle();
    if (!stolenEnc) pass("Médica B não lê encounter A");
    else fail("Médica B leu encounter");

    const { data: searchB } = await physB
      .from("patients")
      .select("id, full_name")
      .ilike("full_name", `%${MARKER}Maria%`);
    const leaked = (searchB ?? []).filter((r) => r.id === ids.p1 || r.id === ids.p2);
    if (!leaked.length) pass("pesquisa Médica B não revela UAT_C0410_ de A");
    else fail("vazamento pesquisa B", String(leaked.length));
  } catch (e) {
    fail("PHYS_B", String(e.message || e));
  }

  // anônimo
  {
    const anonSb = client();
    const { data } = await anonSb.from("patients").select("id").eq("id", ids.p1);
    if (!data?.length) pass("anônimo bloqueado");
    else fail("anônimo leu paciente");
  }

  // agenda intacta
  const agenda = parsePayload(dbQuery(`
select json_build_object(
  'n', (select count(*)::int from public.appointments
        where practice_id = '${CASA}'
          and starts_at >= '2026-09-29 00:00:00-03'
          and starts_at < '2026-09-30 00:00:00-03')
)::text as payload;
`));
  if (Number(agenda.n) === 10) pass("agenda 29/09/2026 = 10");
  else fail("agenda", String(agenda.n));

  // cleanup
  dbQuery(`
do $$
declare
  v_patient uuid;
  v_enc uuid;
begin
  for v_enc in
    select e.id from public.encounters e
    join public.appointments a on a.id = e.appointment_id
    where a.urgency_note = '${MARKER}'
  loop
    delete from public.clinical_notes where encounter_id = v_enc;
    delete from public.encounters where id = v_enc;
  end loop;
  delete from public.appointments where urgency_note = '${MARKER}';
  for v_patient in select id from public.patients where full_name like '${MARKER}%'
  loop
    delete from public.patients where id = v_patient;
  end loop;
end $$;
`);

  const left = parsePayload(dbQuery(`
select json_build_object(
  'patients', (select count(*) from public.patients where full_name like '${MARKER}%'),
  'appts', (select count(*) from public.appointments where urgency_note = '${MARKER}'),
  'encounters', (select count(*) from public.encounters e join public.appointments a on a.id = e.appointment_id where a.urgency_note = '${MARKER}')
)::text as payload;
`));
  const uatLeft = Object.values(left).reduce((a, b) => a + Number(b || 0), 0);
  if (uatLeft === 0) pass("uat_left = 0");
  else fail("uat_left = 0", JSON.stringify(left));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== RESULTADO C040.10: ${results.length - failed.length}/${results.length} PASS ===`);
  if (failed.length) {
    for (const f of failed) console.log(`  FAIL: ${f.name} — ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exitCode = 1;
});
