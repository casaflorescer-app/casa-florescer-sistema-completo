select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('patients', 'patient_practice_links')
order by tablename, policyname;
