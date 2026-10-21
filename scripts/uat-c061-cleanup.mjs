/**
 * Cleanup residual UAT_C061_ (items/warehouses/equipment marcados).
 * Seguro mesmo antes do db push da 0053 (não referencia clinic_equipment em SQL estático).
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MARKER = "UAT_C061_";
const ORG = "22e69ed4-0797-4742-b00e-f625317c6931";

const sql = `
do $$
declare
  v_items uuid[];
  v_wh uuid[];
  v_equip uuid[];
  v_audits uuid[];
  v_before_items int;
  v_before_wh int;
  v_before_equip int := 0;
  v_left int;
begin
  select count(*)::int into v_before_items
  from public.items
  where organization_id = '${ORG}' and (sku like '${MARKER}%' or name like '${MARKER}%');

  select count(*)::int into v_before_wh
  from public.warehouses
  where organization_id = '${ORG}' and code like '${MARKER}%';

  if to_regclass('public.clinic_equipment') is not null then
    execute format(
      $q$select count(*)::int from public.clinic_equipment
         where organization_id = %L
           and (name like %L or coalesce(asset_tag,'') like %L or coalesce(serial_number,'') like %L)$q$,
      '${ORG}', '${MARKER}%', '${MARKER}%', '${MARKER}%'
    ) into v_before_equip;
  end if;

  raise notice 'C061_CLEANUP_BEFORE items=% wh=% equip=%', v_before_items, v_before_wh, v_before_equip;

  select coalesce(array_agg(id), '{}'::uuid[]) into v_items
  from public.items
  where organization_id = '${ORG}'
    and (sku like '${MARKER}%' or name like '${MARKER}%');

  select coalesce(array_agg(id), '{}'::uuid[]) into v_wh
  from public.warehouses
  where organization_id = '${ORG}' and code like '${MARKER}%';

  if to_regclass('public.clinic_equipment') is not null then
    execute format(
      $q$select coalesce(array_agg(id), '{}'::uuid[]) from public.clinic_equipment
         where organization_id = %L
           and (name like %L or coalesce(asset_tag,'') like %L or coalesce(serial_number,'') like %L)$q$,
      '${ORG}', '${MARKER}%', '${MARKER}%', '${MARKER}%'
    ) into v_equip;

    if v_equip is not null and cardinality(v_equip) > 0 then
      execute 'delete from public.clinic_equipment_events where equipment_id = any($1)' using v_equip;
      execute 'delete from public.clinic_equipment where id = any($1)' using v_equip;
    end if;
  end if;

  if cardinality(v_items) > 0 then
    select coalesce(array_agg(id), '{}'::uuid[]) into v_audits
    from public.stock_audits
    where organization_id = '${ORG}'
      and warehouse_id = any(v_wh);

    if cardinality(v_audits) > 0 then
      delete from public.stock_audit_lines where audit_id = any(v_audits);
      delete from public.stock_audits where id = any(v_audits);
    end if;

    delete from public.stock_movements where item_id = any(v_items);
    delete from public.item_lots where item_id = any(v_items);
    delete from public.stock_balances where item_id = any(v_items);
    delete from public.stock_audit_lines where item_id = any(v_items);
    delete from public.items where id = any(v_items);
  end if;

  if cardinality(v_wh) > 0 then
    delete from public.stock_movements where warehouse_id = any(v_wh);
    delete from public.item_lots where warehouse_id = any(v_wh);
    delete from public.stock_balances where warehouse_id = any(v_wh);
    delete from public.stock_audits where warehouse_id = any(v_wh);
    delete from public.warehouses where id = any(v_wh);
  end if;

  v_left := (
    (select count(*)::int from public.items where organization_id = '${ORG}' and (sku like '${MARKER}%' or name like '${MARKER}%'))
    + (select count(*)::int from public.warehouses where organization_id = '${ORG}' and code like '${MARKER}%')
  );

  if to_regclass('public.clinic_equipment') is not null then
    execute format(
      $q$select count(*)::int from public.clinic_equipment
         where organization_id = %L
           and (name like %L or coalesce(asset_tag,'') like %L or coalesce(serial_number,'') like %L)$q$,
      '${ORG}', '${MARKER}%', '${MARKER}%', '${MARKER}%'
    ) into v_before_equip;
    v_left := v_left + coalesce(v_before_equip, 0);
  end if;

  perform set_config('app.c061_uat_left', v_left::text, false);
end $$;

select current_setting('app.c061_uat_left', true) as uat_left;
`;

const file = resolve(process.env.TEMP || "/tmp", "cf-uat-c061-cleanup.sql");
writeFileSync(file, sql, "utf8");
const out = spawnSync(`npx --yes supabase@2.121.0 db query --linked -f "${file}"`, {
  encoding: "utf8",
  shell: true,
  cwd: process.cwd(),
});
const text = `${out.stdout || ""}\n${out.stderr || ""}`;
console.log(text);
const m =
  text.match(/"uat_left"\s*:\s*"?(\d+)"?/) ||
  text.match(/C061_UAT_LEFT=(\d+)/) ||
  text.match(/\buat_left\b[^0-9]*(\d+)/);
const left = m ? Number(m[1]) : null;
if (left === 0) {
  console.log("OK — uat_left = 0");
  process.exit(0);
}
if (left == null && !/ERROR|42P01|Failed to run/i.test(text)) {
  console.log("OK — cleanup sem erro (uat_left não parseado; pré-0053)");
  process.exit(0);
}
console.error("FAIL — uat_left =", left);
process.exit(1);
