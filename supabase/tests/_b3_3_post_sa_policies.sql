select tablename, policyname, cmd, left(qual, 200) as qual
from pg_policies
where schemaname = 'public'
  and (
    policyname ilike '%system_admin%'
    or coalesce(qual,'') ilike '%is_system_admin%'
  )
order by tablename, policyname;
