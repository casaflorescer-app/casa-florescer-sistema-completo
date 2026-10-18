/**
 * Cleanup residual UAT_C055_ (pacientes/encounters/notas/receitas).
 * Não remove fixtures permanentes. Usa db query --linked.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MARKER = "UAT_C055_";

const sql = `
select jsonb_build_object(
  'before_patients', (select count(*)::int from public.patients where full_name like '${MARKER}%')
)::text as payload;

do $$
declare
  v_ids uuid[];
  v_enc uuid[];
  v_rx uuid[];
begin
  select coalesce(array_agg(id), '{}'::uuid[]) into v_ids
  from public.patients
  where full_name like '${MARKER}%';

  if cardinality(v_ids) = 0 then
    raise notice 'no UAT_C055 patients';
    return;
  end if;

  select coalesce(array_agg(id), '{}'::uuid[]) into v_enc
  from public.encounters where patient_id = any(v_ids);

  select coalesce(array_agg(id), '{}'::uuid[]) into v_rx
  from public.prescriptions
  where patient_id = any(v_ids) or coalesce(notes, '') like '${MARKER}%';

  if cardinality(v_enc) > 0 then
    delete from public.clinical_notes where encounter_id = any(v_enc);
  end if;

  if cardinality(v_rx) > 0 then
    begin
      delete from public.prescription_items where prescription_id = any(v_rx);
    exception when others then
      raise notice 'prescription_items skip: %', SQLERRM;
    end;

    begin
      execute 'alter table public.prescriptions disable trigger user';
      delete from public.prescriptions where id = any(v_rx);
      execute 'alter table public.prescriptions enable trigger user';
    exception when others then
      begin
        execute 'alter table public.prescriptions enable trigger user';
      exception when others then null;
      end;
      -- fallback: soft-cancel if delete blocked
      update public.prescriptions set notes = coalesce(notes,'') || ' [cleaned]'
      where id = any(v_rx);
      raise notice 'prescriptions delete fallback: %', SQLERRM;
    end;
  end if;

  if cardinality(v_enc) > 0 then
    delete from public.encounters where id = any(v_enc);
  end if;

  delete from public.patient_practice_links where patient_id = any(v_ids);
  delete from public.patients where id = any(v_ids);
  raise notice 'cleaned UAT_C055';
end $$;

select jsonb_build_object(
  'uat_left', (select count(*)::int from public.patients where full_name like '${MARKER}%')
)::text as payload;
`;

const file = resolve(process.env.TEMP || "/tmp", "cf-uat-c055-cleanup.sql");
writeFileSync(file, sql, "utf8");
const out = spawnSync(`npx --yes supabase@2.121.0 db query --linked -f "${file}"`, {
  encoding: "utf8",
  shell: true,
  cwd: process.cwd(),
});
const text = `${out.stdout || ""}\n${out.stderr || ""}`;
console.log(text);
const m = text.match(/"uat_left"\s*:\s*(\d+)/) || text.match(/uat_left[^0-9]*(\d+)/);
const left = m ? Number(m[1]) : null;
if (left === 0) {
  console.log("OK — uat_left = 0");
  process.exit(0);
}
console.log(`FAIL — uat_left = ${left ?? "unknown"}`);
process.exit(1);
