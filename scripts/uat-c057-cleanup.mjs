/**
 * Cleanup residual UAT_C057_ (contratos/eventos marcados).
 * Não remove fixtures permanentes. Usa db query --linked.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MARKER = "UAT_C057_";

const sql = `
select jsonb_build_object(
  'before', (select count(*)::int from public.rental_contracts where tenant_name like '${MARKER}%' or coalesce(notes,'') like '${MARKER}%')
)::text as payload;

do $$
declare
  v_ids uuid[];
begin
  select coalesce(array_agg(id), '{}'::uuid[]) into v_ids
  from public.rental_contracts
  where tenant_name like '${MARKER}%'
     or coalesce(notes, '') like '${MARKER}%';

  if cardinality(v_ids) = 0 then
    raise notice 'no UAT_C057 contracts';
    return;
  end if;

  begin
    delete from public.rental_contract_events where contract_id = any(v_ids);
  exception when undefined_table then
    raise notice 'rental_contract_events ausente';
  end;

  begin
    delete from public.rental_statements where rental_contract_id = any(v_ids);
  exception when others then
    raise notice 'rental_statements skip: %', SQLERRM;
  end;

  delete from public.rental_contracts where id = any(v_ids);
  raise notice 'cleaned UAT_C057';
end $$;

select jsonb_build_object(
  'uat_left', (select count(*)::int from public.rental_contracts where tenant_name like '${MARKER}%' or coalesce(notes,'') like '${MARKER}%')
)::text as payload;
`;

const file = resolve(process.env.TEMP || "/tmp", "cf-uat-c057-cleanup.sql");
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
