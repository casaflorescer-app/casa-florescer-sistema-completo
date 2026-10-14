import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MARKER = "UAT_C0407_";
const SB = resolve(process.env.TEMP || "/tmp", "supabase-cli-c0407-new/node_modules/.bin/supabase.cmd");

function readEnv(name) {
  const line = readFileSync(resolve(".env.local"), "utf8")
    .split(/\r?\n/)
    .find((item) => item.startsWith(name + "="));
  return line.slice(name.length + 1).trim().replace(/^"|"$/g, "");
}

function dbQuery(sql) {
  const file = resolve(process.env.TEMP || "/tmp", "cf-uat-c0407-cleanup.sql");
  writeFileSync(file, sql, "utf8");
  const out = spawnSync(`"${SB}" db query --linked -f "${file}"`, {
    encoding: "utf8",
    shell: true,
    cwd: process.cwd(),
  });
  return `${out.stdout || ""}\n${out.stderr || ""}`;
}

function parsePayload(text) {
  const m = text.match(/"payload":\s*"((?:\\.|[^"\\])*)"/);
  if (!m) return null;
  return JSON.parse(m[1].replace(/\\"/g, '"'));
}

const password = process.env.UAT_B34_PASSWORD;
const sb = createClient(readEnv("NEXT_PUBLIC_SUPABASE_URL"), readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
  auth: { persistSession: false },
});
const { error: loginError } = await sb.auth.signInWithPassword({
  email: "uat.b34.physician.a@exemplo.local",
  password,
});
if (loginError) throw loginError;

const pathsInfo = parsePayload(dbQuery(`
select json_build_object(
  'paths', coalesce((
    select jsonb_agg(o.name)
    from storage.objects o
    where o.bucket_id = 'clinical-documents'
      and (
        o.name like '%' || coalesce((
          select id::text from public.patients where full_name like '${MARKER}%' limit 1
        ), '00000000-0000-0000-0000-000000000000') || '%'
        or exists (
          select 1 from public.clinical_document_artifacts d
          join public.patients p on p.id = d.patient_id
          where p.full_name like '${MARKER}%'
            and o.name like '%' || d.id::text || '%'
        )
      )
  ), '[]'::jsonb)
)::text as payload;
`));

const paths = Array.isArray(pathsInfo?.paths) ? pathsInfo.paths.filter(Boolean) : [];
if (paths.length) {
  const { error } = await sb.storage.from("clinical-documents").remove(paths);
  console.log("storage remove:", error?.message || "ok", paths.length);
} else {
  console.log("storage: nothing to remove");
}

const clean = dbQuery(`
alter table public.prescription_items disable trigger prescription_items_guard;
alter table public.clinical_exam_request_items disable trigger clinical_exam_request_items_document_guard;
alter table public.clinical_document_artifacts disable trigger clinical_document_artifacts_before_write;
do $$
declare
  v_patient uuid;
  v_enc uuid;
  v_doc uuid;
begin
  for v_patient in select id from public.patients where full_name like '${MARKER}%'
  loop
    update public.clinical_document_artifacts
       set supersedes_id = null
     where patient_id = v_patient;
    for v_doc in
      select id from public.clinical_document_artifacts
      where patient_id = v_patient
      order by version desc
    loop
      delete from public.patient_notifications where reference_id = v_doc;
      delete from public.clinical_document_artifacts where id = v_doc;
    end loop;
    for v_enc in select id from public.encounters where patient_id = v_patient
    loop
      delete from public.clinical_exam_request_items where request_id in (
        select id from public.clinical_exam_requests where encounter_id = v_enc
      );
      delete from public.clinical_exam_requests where encounter_id = v_enc;
      delete from public.prescription_items where prescription_id in (
        select id from public.prescriptions where encounter_id = v_enc or notes like '${MARKER}%'
      );
      delete from public.prescriptions where encounter_id = v_enc or notes like '${MARKER}%';
      delete from public.clinical_notes where encounter_id = v_enc;
      delete from public.encounters where id = v_enc;
    end loop;
    delete from public.appointments where patient_id = v_patient and urgency_note = '${MARKER}';
    delete from public.patients where id = v_patient;
  end loop;
  delete from public.clinical_exam_catalog where name like '${MARKER}%';
end $$;
alter table public.clinical_document_artifacts enable trigger clinical_document_artifacts_before_write;
alter table public.clinical_exam_request_items enable trigger clinical_exam_request_items_document_guard;
alter table public.prescription_items enable trigger prescription_items_guard;

select json_build_object(
  'patients', (select count(*) from public.patients where full_name like '${MARKER}%'),
  'docs', (select count(*) from public.clinical_document_artifacts d join public.patients p on p.id = d.patient_id where p.full_name like '${MARKER}%'),
  'rx', (select count(*) from public.prescriptions where notes like '${MARKER}%'),
  'appts', (select count(*) from public.appointments where urgency_note = '${MARKER}'),
  'catalog', (select count(*) from public.clinical_exam_catalog where name like '${MARKER}%'),
  'storage', (select count(*) from storage.objects where bucket_id = 'clinical-documents' and name like '%UAT_C0407%')
)::text as payload;
`);

console.log(clean);
const left = parsePayload(clean);
const uatLeft = left ? Object.values(left).reduce((a, b) => a + Number(b || 0), 0) : -1;
console.log("uat_left=", uatLeft, left);
if (uatLeft !== 0) process.exitCode = 1;
