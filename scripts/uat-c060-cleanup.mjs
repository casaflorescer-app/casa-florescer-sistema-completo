/**
 * C060 — cleanup massa UAT_C060_
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MARKER = "UAT_C060_";
const ORG = "22e69ed4-0797-4742-b00e-f625317c6931";

function dbQuery(sql) {
  const file = resolve(process.env.TEMP || "/tmp", "cf-uat-c060-cleanup.sql");
  writeFileSync(file, sql, "utf8");
  const out = spawnSync(`npx --yes supabase@2.121.0 db query --linked -f "${file}"`, {
    encoding: "utf8",
    shell: true,
    cwd: process.cwd(),
  });
  return `${out.stdout || ""}\n${out.stderr || ""}`;
}

const probe = dbQuery(`select to_regclass('public.clinic_specialties')::text as reg;`);
if (!/"reg":\s*"(public\.)?clinic_specialties"/.test(probe)) {
  console.log(probe.slice(0, 400));
  console.log("OK — uat_left = 0 (schema C060 ainda não aplicado)");
  process.exit(0);
}

const text = dbQuery(`
delete from public.procedure_agreement_events where organization_id = '${ORG}'
  and agreement_id in (
    select id from public.procedure_agreements
    where organization_id = '${ORG}'
      and (title like '${MARKER}%' or procedure_name like '${MARKER}%' or notes like '${MARKER}%')
  );
delete from public.procedure_agreements
where organization_id = '${ORG}'
  and (title like '${MARKER}%' or procedure_name like '${MARKER}%' or notes like '${MARKER}%');
delete from public.obstetric_availability_contract_events where organization_id = '${ORG}'
  and contract_id in (
    select id from public.obstetric_availability_contracts
    where organization_id = '${ORG}' and notes like '${MARKER}%'
  );
delete from public.obstetric_availability_contracts
where organization_id = '${ORG}' and notes like '${MARKER}%';
delete from public.clinic_workforce
where organization_id = '${ORG}' and full_name like '${MARKER}%';
delete from public.professional_specialties where specialty_id in (
  select id from public.clinic_specialties where organization_id = '${ORG}' and name like '${MARKER}%'
);
delete from public.clinic_specialties
where organization_id = '${ORG}' and name like '${MARKER}%';

select (
  (select count(*)::int from public.clinic_specialties where name like '${MARKER}%')
  + (select count(*)::int from public.clinic_workforce where full_name like '${MARKER}%')
  + (select count(*)::int from public.obstetric_availability_contracts where notes like '${MARKER}%')
  + (select count(*)::int from public.procedure_agreements where title like '${MARKER}%' or procedure_name like '${MARKER}%')
) as uat_left;
`);

console.log(text.slice(0, 1200));
if (/"uat_left":\s*0/.test(text)) {
  console.log("OK — uat_left = 0");
  process.exit(0);
}
console.error("FAIL — residual UAT_C060_");
process.exit(1);
