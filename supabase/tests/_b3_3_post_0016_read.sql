-- TESTE B3.3 / pós-0016 — auditoria somente leitura + probes (restore memberships/policies)
-- NÃO aplica DDL permanente. NÃO apaga dados reais.

-- 1) Policies patients / patient_practice_links
select 'POLICIES' as section, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('patients', 'patient_practice_links')
order by tablename, policyname;

-- 2) God-mode gone?
select 'GODMODE' as section,
  exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='patients' and policyname='patients_system_admin'
  ) as patients_system_admin_exists,
  exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='patient_practice_links'
      and policyname='patient_practice_links_system_admin'
  ) as links_system_admin_exists;

-- 3) RLS enabled
select 'RLS' as section, c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('patients', 'patient_practice_links')
order by 2;

-- 4) patient_accounts SA policies (P2 inventory)
select 'PA_SA' as section, tablename, policyname, cmd, qual
from pg_policies
where schemaname = 'public'
  and (
    policyname ilike '%system_admin%'
    or qual ilike '%is_system_admin%'
  )
  and tablename in (
    'patients', 'patient_practice_links', 'patient_accounts',
    'pregnancies', 'pregnancy_events', 'pregnancy_backup_grants',
    'professional_care_policies', 'professional_care_policy_versions',
    'pregnancy_procedures', 'pregnancy_procedure_payouts',
    'pregnancy_procedure_payout_events', 'professional_payout_ledger_entries'
  )
order by tablename, policyname;

-- 5) Counts
select 'COUNTS' as section, 'patients' as t, count(*)::text as n from patients
union all select 'COUNTS', 'pregnancies', count(*)::text from pregnancies
union all select 'COUNTS', 'pregnancy_procedures', count(*)::text from pregnancy_procedures
union all select 'COUNTS', 'pregnancy_procedure_payouts', count(*)::text from pregnancy_procedure_payouts
union all select 'COUNTS', 'pregnancy_procedure_payout_events', count(*)::text from pregnancy_procedure_payout_events
union all select 'COUNTS', 'professional_payout_ledger_entries', count(*)::text from professional_payout_ledger_entries;

-- 6) Migration versions present
select 'MIG' as section, version::text as version
from supabase_migrations.schema_migrations
where version::text like '001%' or version::text in ('11','12','13','14','15','16')
order by version::text;
