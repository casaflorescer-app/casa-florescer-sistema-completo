select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'pregnancy_procedures',
    'pregnancy_procedure_payouts',
    'pregnancy_procedure_payout_events',
    'professional_payout_ledger_entries',
    'pregnancies',
    'pregnancy_events',
    'pregnancy_backup_grants',
    'professional_care_policies',
    'professional_care_policy_versions'
  )
order by 1;
