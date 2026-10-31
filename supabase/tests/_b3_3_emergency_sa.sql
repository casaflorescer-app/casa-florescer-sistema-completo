select count(*) as sa_memb
from public.user_practice_roles
where user_id = '0a8b2369-7fb9-4727-9043-37710ef1679b';

select tablename, policyname
from pg_policies
where schemaname = 'public'
  and tablename in ('patients', 'patient_practice_links')
  and policyname like '%system_admin%'
order by 1, 2;
