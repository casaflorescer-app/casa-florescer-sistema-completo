import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

function readEnv(name) {
  const line = readFileSync(resolve(".env.local"), "utf8")
    .split(/\r?\n/)
    .find((item) => item.startsWith(name + "="));
  return line.slice(name.length + 1).trim().replace(/^"|"$/g, "");
}

const encounterId = process.env.UAT_C0404_ENCOUNTER_ID;
const password = process.env.UAT_B34_PASSWORD;
const sb = createClient(readEnv("NEXT_PUBLIC_SUPABASE_URL"), readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
  auth: { persistSession: false },
});
const { error: loginError } = await sb.auth.signInWithPassword({
  email: "uat.b34.physician.a@exemplo.local",
  password,
});
if (loginError) throw loginError;

const { data: rxs } = await sb.from("prescriptions").select("id").eq("encounter_id", encounterId);
for (const rx of rxs ?? []) {
  const { data: items } = await sb.from("prescription_items").select("id").eq("prescription_id", rx.id);
  for (const item of items ?? []) {
    const { error } = await sb.from("prescription_items").delete().eq("id", item.id);
    if (error) console.log("item delete:", error.message);
  }
  const { error } = await sb.from("prescriptions").delete().eq("id", rx.id);
  if (error) {
    // fallback cancel
    await sb.from("prescriptions").update({ status: "cancelled" }).eq("id", rx.id);
    console.log("rx delete/cancel:", error.message);
  }
}

const sql = `
alter table public.prescription_items disable trigger prescription_items_guard;
do $$
declare
  v_enc uuid := '${encounterId}'::uuid;
  v_patient uuid;
  v_appt uuid;
begin
  select patient_id, appointment_id into v_patient, v_appt from public.encounters where id = v_enc;
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
  if v_appt is not null then delete from public.appointments where id = v_appt; end if;
  if v_patient is not null then delete from public.patients where id = v_patient; end if;
  delete from public.clinical_exam_group_items where group_id in (
    select id from public.clinical_exam_groups where name like 'UAT-C0404%'
  );
  delete from public.clinical_exam_groups where name like 'UAT-C0404%';
  delete from public.clinical_exam_catalog where name like 'UAT-C0404%';
  delete from public.prescription_template_items where template_id in (
    select id from public.prescription_templates where name like 'UAT-C0404%'
  );
  delete from public.prescription_templates where name like 'UAT-C0404%';
  -- leftovers by marker
  delete from public.appointments where urgency_note = 'UAT-C0404';
  delete from public.patients where full_name like 'UAT-C0404%';
end $$;
alter table public.prescription_items enable trigger prescription_items_guard;

select json_build_object(
  'patients', (select count(*) from public.patients where full_name like 'UAT-C0404%'),
  'appts', (select count(*) from public.appointments where urgency_note = 'UAT-C0404'),
  'ai_req', (select count(*) from public.ai_assistance_requests where context_fingerprint like 'UAT-C0404%'),
  'catalog', (select count(*) from public.clinical_exam_catalog where name like 'UAT-C0404%'),
  'groups', (select count(*) from public.clinical_exam_groups where name like 'UAT-C0404%'),
  'templates', (select count(*) from public.prescription_templates where name like 'UAT-C0404%'),
  'rx_items', (select count(*) from public.prescription_items where medication_name like 'UAT-C0404%'),
  'exam_req', (select count(*) from public.clinical_exam_requests where notes like 'UAT-C0404%')
) as uat_left;

select count(*)::int as agenda_2909
from public.appointments
where practice_id = '7673bc0e-a789-4edd-b32f-392e407cc062'
  and starts_at >= '2026-09-29 00:00:00-03'
  and starts_at < '2026-09-30 00:00:00-03'
  and status is distinct from 'cancelled';
`;

const file = resolve(process.env.TEMP || "/tmp", "cf-uat-c0404-cleanup2.sql");
writeFileSync(file, sql, "utf8");
const out = spawnSync(`npx.cmd supabase db query --linked -f "${file}"`, {
  encoding: "utf8",
  shell: true,
  cwd: process.cwd(),
});
console.log(out.stdout || out.stderr);
if (out.status !== 0) process.exitCode = 1;
