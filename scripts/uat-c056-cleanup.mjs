/**
 * Cleanup residual UAT_C056_
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MARKER = "UAT_C056_";
const sql = `
do $$
declare v_ids uuid[];
begin
  select coalesce(array_agg(id), '{}'::uuid[]) into v_ids
  from public.patients where full_name like '${MARKER}%';
  if cardinality(v_ids)=0 then
    raise notice 'no UAT_C056 patients';
    return;
  end if;
  delete from public.clinical_notes where encounter_id in (select id from public.encounters where patient_id = any(v_ids));
  delete from public.encounters where patient_id = any(v_ids);
  delete from public.patient_practice_links where patient_id = any(v_ids);
  delete from public.patients where id = any(v_ids);
end $$;
select jsonb_build_object(
  'uat_left', (select count(*)::int from public.patients where full_name like '${MARKER}%')
)::text as payload;
`;

const file = resolve(process.env.TEMP || "/tmp", "cf-uat-c056-cleanup.sql");
writeFileSync(file, sql, "utf8");
const out = spawnSync(`npx --yes supabase@2.121.0 db query --linked -f "${file}"`, {
  encoding: "utf8",
  shell: true,
  cwd: process.cwd(),
});
const text = `${out.stdout || ""}\n${out.stderr || ""}`;
console.log(text);
function parseUatLeft(raw) {
  const direct = raw.match(/"uat_left"\s*:\s*(\d+)/);
  if (direct) return Number(direct[1]);
  const escaped = raw.match(/\\"uat_left\\"\s*:\s*(\d+)/);
  if (escaped) return Number(escaped[1]);
  const nested = raw.match(/payload"\s*:\s*"\{\\?"uat_left\\?":\s*(\d+)/);
  if (nested) return Number(nested[1]);
  return null;
}
const left = parseUatLeft(text);
if (left === 0) {
  console.log("OK — uat_left = 0");
  process.exit(0);
}
console.log(`FAIL — uat_left = ${left ?? "unknown"}`);
process.exit(1);
