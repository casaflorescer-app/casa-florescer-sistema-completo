/**
 * Cleanup residual UAT_C058_ (items/movements/warehouses marcados).
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MARKER = "UAT_C058_";
const ORG = "22e69ed4-0797-4742-b00e-f625317c6931";

const sql = `
select jsonb_build_object(
  'before_items', (select count(*)::int from public.items where organization_id = '${ORG}' and (sku like '${MARKER}%' or name like '${MARKER}%')),
  'before_wh', (select count(*)::int from public.warehouses where organization_id = '${ORG}' and code like '${MARKER}%')
)::text as payload;

do $$
declare
  v_items uuid[];
  v_wh uuid[];
  v_audits uuid[];
begin
  select coalesce(array_agg(id), '{}'::uuid[]) into v_items
  from public.items
  where organization_id = '${ORG}'
    and (sku like '${MARKER}%' or name like '${MARKER}%');

  select coalesce(array_agg(id), '{}'::uuid[]) into v_wh
  from public.warehouses
  where organization_id = '${ORG}' and code like '${MARKER}%';

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
end $$;

select jsonb_build_object(
  'uat_left', (
    (select count(*)::int from public.items where organization_id = '${ORG}' and (sku like '${MARKER}%' or name like '${MARKER}%'))
    + (select count(*)::int from public.warehouses where organization_id = '${ORG}' and code like '${MARKER}%')
  )
)::text as payload;
`;

const file = resolve(process.env.TEMP || "/tmp", "cf-uat-c058-cleanup.sql");
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
