/**
 * Cleanup residual UAT_C062_.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MARKER = "UAT_C062_";
const ORG = "22e69ed4-0797-4742-b00e-f625317c6931";

const sql = `
do $$
declare
  v_items uuid[];
  v_patients uuid[];
  v_equip uuid[];
  v_left int;
  v_eq int := 0;
begin
  select coalesce(array_agg(id), '{}'::uuid[]) into v_patients
  from public.patients
  where organization_id = '${ORG}' and full_name like '${MARKER}%';

  if cardinality(v_patients) > 0 then
    delete from public.patient_practice_links where patient_id = any(v_patients);
    delete from public.consents where patient_id = any(v_patients);
    delete from public.patients where id = any(v_patients)
      and not exists (select 1 from public.appointments a where a.patient_id = patients.id)
      and not exists (select 1 from public.encounters e where e.patient_id = patients.id);
  end if;

  select coalesce(array_agg(id), '{}'::uuid[]) into v_items
  from public.items
  where organization_id = '${ORG}'
    and (sku like '${MARKER}%' or name like '${MARKER}%');

  if cardinality(v_items) > 0 then
    delete from public.stock_movements where item_id = any(v_items);
    delete from public.item_lots where item_id = any(v_items);
    delete from public.stock_balances where item_id = any(v_items);
    delete from public.stock_audit_lines where item_id = any(v_items);
    delete from public.items where id = any(v_items);
  end if;

  if to_regclass('public.clinic_equipment') is not null then
    execute format(
      $q$select coalesce(array_agg(id), '{}'::uuid[]) from public.clinic_equipment
         where organization_id = %L
           and (name like %L or coalesce(asset_tag,'') like %L)$q$,
      '${ORG}', '${MARKER}%', '${MARKER}%'
    ) into v_equip;
    if v_equip is not null and cardinality(v_equip) > 0 then
      execute 'delete from public.clinic_equipment_events where equipment_id = any($1)' using v_equip;
      execute 'delete from public.clinic_equipment where id = any($1)' using v_equip;
    end if;
  end if;

  v_left := (
    (select count(*)::int from public.patients where organization_id = '${ORG}' and full_name like '${MARKER}%')
    + (select count(*)::int from public.items where organization_id = '${ORG}' and (sku like '${MARKER}%' or name like '${MARKER}%'))
  );

  if to_regclass('public.clinic_equipment') is not null then
    execute format(
      $q$select count(*)::int from public.clinic_equipment
         where organization_id = %L and (name like %L or coalesce(asset_tag,'') like %L)$q$,
      '${ORG}', '${MARKER}%', '${MARKER}%'
    ) into v_eq;
    v_left := v_left + coalesce(v_eq, 0);
  end if;

  perform set_config('app.c062_uat_left', v_left::text, false);
end $$;

select current_setting('app.c062_uat_left', true) as uat_left;
`;

const file = resolve(process.env.TEMP || "/tmp", "cf-uat-c062-cleanup.sql");
writeFileSync(file, sql, "utf8");
const out = spawnSync(`npx --yes supabase@2.121.0 db query --linked -f "${file}"`, {
  encoding: "utf8",
  shell: true,
  cwd: process.cwd(),
});
const text = `${out.stdout || ""}\n${out.stderr || ""}`;
console.log(text);
const m = text.match(/"uat_left"\s*:\s*"?(\d+)"?/) || text.match(/\buat_left\b[^0-9]*(\d+)/);
const left = m ? Number(m[1]) : null;
if (left === 0) {
  console.log("OK — uat_left = 0");
  process.exit(0);
}
if (left == null && !/ERROR|Failed to run/i.test(text)) {
  console.log("OK — cleanup sem erro parseável");
  process.exit(0);
}
console.error("FAIL — uat_left =", left);
process.exit(1);
