/**
 * Limpeza UAT C040.8 — marcador UAT_C0408_
 * Não aplica migration. Não cria commit/push/deploy.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MARKER = "UAT_C0408_";
const CASA = "7673bc0e-a789-4edd-b32f-392e407cc062";
const SB = resolve(process.env.TEMP || "/tmp", "supabase-cli-c0407-new/node_modules/.bin/supabase.cmd");

function readEnv(name) {
  const line = readFileSync(resolve(".env.local"), "utf8")
    .split(/\r?\n/)
    .find((item) => item.startsWith(name + "="));
  if (!line) throw new Error("missing " + name);
  return line.slice(name.length + 1).trim().replace(/^"|"$/g, "");
}

function dbQuery(sql) {
  const file = resolve(process.env.TEMP || "/tmp", "cf-uat-c0408-clean.sql");
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
  if (!m) throw new Error("payload not found: " + text.slice(0, 400));
  return JSON.parse(m[1].replace(/\\"/g, '"'));
}

const url = readEnv("NEXT_PUBLIC_SUPABASE_URL");
const anon = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const password = process.env.UAT_B34_PASSWORD;
if (!password || password.length < 12) throw new Error("UAT_B34_PASSWORD ausente");

const phys = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
await phys.auth.signInWithPassword({
  email: "uat.b34.physician.a@exemplo.local",
  password,
});

const pathsPayload = parsePayload(dbQuery(`
select json_build_object(
  'paths', coalesce((
    select jsonb_agg(name)
    from storage.objects
    where bucket_id = 'clinical-documents'
      and name like '%'
      and name in (
        select d.pdf_storage_path
        from public.clinical_document_artifacts d
        join public.patients p on p.id = d.patient_id
        where p.full_name like '${MARKER}%'
          and d.pdf_storage_path is not null
      )
  ), '[]'::jsonb)
)::text as payload;
`));

const paths = Array.isArray(pathsPayload.paths) ? pathsPayload.paths.filter(Boolean) : [];
if (paths.length) {
  for (const objectPath of paths) {
    const rm = spawnSync(
      `npx --yes supabase@2.121.0 storage rm --experimental --yes --linked "ss:///clinical-documents/${objectPath}"`,
      { encoding: "utf8", shell: true, cwd: process.cwd() },
    );
    console.log(`storage rm ${objectPath}: status=${rm.status}`);
  }
} else {
  console.log("storage: nothing to remove");
}

dbQuery(`
alter table public.clinical_document_artifacts disable trigger clinical_document_artifacts_before_write;
do $$
declare
  r record;
  v_patient uuid;
  v_enc uuid;
begin
  for r in
    select d.id, d.version
    from public.clinical_document_artifacts d
    join public.patients p on p.id = d.patient_id
    where p.full_name like '${MARKER}%'
    order by d.version desc
  loop
    update public.clinical_document_artifacts set supersedes_id = null where id = r.id;
    delete from public.clinical_document_artifacts where id = r.id;
  end loop;

  delete from public.clinical_orientation_versions v
  using public.clinical_orientations o
  join public.patients p on p.id = o.patient_id
  where v.orientation_id = o.id and p.full_name like '${MARKER}%';

  delete from public.clinical_orientations o
  using public.patients p
  where o.patient_id = p.id and p.full_name like '${MARKER}%';

  delete from public.prescriptions where notes like '${MARKER}%';
  delete from public.clinical_exam_requests where notes like '${MARKER}%';
  delete from public.clinical_exam_catalog where name like '${MARKER}%';

  for v_patient in select id from public.patients where full_name like '${MARKER}%'
  loop
    for v_enc in select id from public.encounters where patient_id = v_patient
    loop
      delete from public.clinical_notes where encounter_id = v_enc;
      delete from public.encounters where id = v_enc;
    end loop;
    delete from public.appointments where patient_id = v_patient and urgency_note = '${MARKER}';
    delete from public.patients where id = v_patient;
  end loop;
end $$;
alter table public.clinical_document_artifacts enable trigger clinical_document_artifacts_before_write;
`);

const left = parsePayload(dbQuery(`
select json_build_object(
  'patients', (select count(*) from public.patients where full_name like '${MARKER}%'),
  'docs', (select count(*) from public.clinical_document_artifacts d join public.patients p on p.id = d.patient_id where p.full_name like '${MARKER}%'),
  'ori', (select count(*) from public.clinical_orientations o join public.patients p on p.id = o.patient_id where p.full_name like '${MARKER}%'),
  'appts', (select count(*) from public.appointments where urgency_note = '${MARKER}'),
  'storage', (select count(*) from storage.objects where bucket_id = 'clinical-documents' and name like '%${MARKER}%')
)::text as payload;
`));

console.log("uat_left=", Object.values(left).reduce((a, b) => a + Number(b || 0), 0), left);
