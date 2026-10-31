-- Probe SA identities (TESTE B3.3 — read-only)
select
  p.id,
  p.email,
  p.full_name,
  p.is_active,
  (
    select json_agg(json_build_object(
      'practice_id', upr.practice_id,
      'role', upr.role
    ))
    from public.user_practice_roles upr
    where upr.user_id = p.id
  ) as memberships
from public.profiles p
where exists (
  select 1 from public.system_admins s
  where s.user_id = p.id and s.revoked_at is null
);
