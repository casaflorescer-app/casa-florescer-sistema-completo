/**
 * Cleanup residual UAT_C063_ (pacientes e vínculos marcados).
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MARKER = "UAT_C063_";
const ORG = "22e69ed4-0797-4742-b00e-f625317c6931";

const sql = `
do $$
declare
  v_patients uuid[];
  v_before int;
  v_left int;
begin
  select count(*)::int into v_before
  from public.patients
  where organization_id = '${ORG}'
    and full_name like '${MARKER}%';

  raise notice 'C063_CLEANUP_BEFORE patients=%', v_before;

  select coalesce(array_agg(id), '{}'::uuid[]) into v_patients
  from public.patients
  where organization_id = '${ORG}'
    and full_name like '${MARKER}%';

  if array_length(v_patients, 1) is not null then
    delete from public.patient_practice_links
    where patient_id = any(v_patients);

    delete from public.patients
    where id = any(v_patients);
  end if;

  select count(*)::int into v_left
  from public.patients
  where organization_id = '${ORG}'
    and full_name like '${MARKER}%';

  raise notice 'C063_CLEANUP_AFTER uat_left=%', v_left;

  if v_left <> 0 then
    raise exception 'C063 cleanup incomplete: uat_left=%', v_left;
  end if;
end $$;
`;

const file = resolve(process.env.TEMP || "/tmp", "cf-uat-c063-cleanup.sql");
writeFileSync(file, sql, "utf8");
const r = spawnSync(`npx --yes supabase@2.121.0 db query --linked -f "${file}"`, {
  encoding: "utf8",
  shell: true,
  cwd: process.cwd(),
});

process.stdout.write(r.stdout || "");
process.stderr.write(r.stderr || "");
if (r.status !== 0) process.exit(r.status || 1);

if ((r.stdout || "").includes("uat_left=0") || (r.stderr || "").includes("uat_left=0")) {
  console.log("OK — C063 cleanup uat_left=0");
} else {
  console.log("OK — C063 cleanup finished (check NOTICE above)");
}
