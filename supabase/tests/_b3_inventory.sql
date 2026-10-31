-- B3 inventory (read-only)
select 'practices' as kind, pu.id::text, pu.name, pu.code, pu.organization_id::text
from public.practice_units pu
union all
select 'profile', pr.id::text, pr.full_name, pr.email::text, pr.organization_id::text
from public.profiles pr
order by 1, 3;
