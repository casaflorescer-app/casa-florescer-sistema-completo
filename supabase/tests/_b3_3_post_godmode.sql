select
  exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='patients' and policyname='patients_system_admin'
  ) as patients_system_admin_exists,
  exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='patient_practice_links'
      and policyname='patient_practice_links_system_admin'
  ) as links_system_admin_exists;

select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('patients', 'patient_practice_links');
