select
  exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='patients' and policyname='patients_system_admin'
  ) as patients_system_admin_exists,
  exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='patient_practice_links'
      and policyname='patient_practice_links_system_admin'
  ) as links_system_admin_exists,
  (select count(*) from user_practice_roles where user_id='0a8b2369-7fb9-4727-9043-37710ef1679b') as sa_memb_count;
