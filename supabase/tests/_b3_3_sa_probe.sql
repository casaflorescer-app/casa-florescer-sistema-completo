-- TESTE B3.3 — probe SYSTEM_ADMIN identity (read-only)
select
  p.id as user_id,
  p.email,
  p.full_name,
  p.is_active as profile_active,
  exists (
    select 1 from public.system_admins sa where sa.user_id = p.id
  ) as is_listed_sa,
  (
    select coalesce(json_agg(json_build_object(
      'practice_id', upr.practice_id,
      'role', upr.role,
      'practice', pu.name
    )), '[]'::json)
    from public.user_practice_roles upr
    left join public.practice_units pu on pu.id = upr.practice_id
    where upr.user_id = p.id
  ) as memberships
from public.profiles p
where p.id = '0a8b2369-7fb9-4727-9043-37710ef1679b'
   or exists (select 1 from public.system_admins sa where sa.user_id = p.id);

-- Policies that grant is_system_admin on clinical/commercial B1/B2 tables
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and (
    qual ilike '%is_system_admin%'
    or with_check ilike '%is_system_admin%'
  )
  and tablename in (
    'patients',
    'pregnancies',
    'pregnancy_events',
    'pregnancy_backup_grants',
    'professional_care_policies',
    'professional_care_policy_versions',
    'pregnancy_procedures',
    'pregnancy_procedure_payouts',
    'pregnancy_procedure_payout_events',
    'professional_payout_ledger_entries',
    'patient_practice_links',
    'encounters',
    'clinical_notes'
  )
order by tablename, policyname;
