-- Inspect all patients RLS policies + why SA without memb still sees rows
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'patients'
order by policyname;

-- After simulating: who is SA, strip memb, drop sa policy, list visible patient ids
do $x$
declare
  v_uid_sa uuid := '0a8b2369-7fb9-4727-9043-37710ef1679b';
  v_memb jsonb;
  r record;
begin
  select coalesce(jsonb_agg(to_jsonb(upr)), '[]'::jsonb) into v_memb
  from user_practice_roles upr where user_id = v_uid_sa;

  delete from user_practice_roles where user_id = v_uid_sa;
  drop policy if exists patients_system_admin on public.patients;

  perform set_config('request.jwt.claim.sub', v_uid_sa::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_uid_sa::text, 'role', 'authenticated', 'aud', 'authenticated')::text,
    true
  );

  begin
    execute 'set local role authenticated';
    raise notice 'visible_ids=%', (
      select coalesce(string_agg(id::text, ','), '') from patients
    );
    raise notice 'is_sa=%', public.is_system_admin();
    raise notice 'has_any_role=%', exists (
      select 1 from user_practice_roles where user_id = v_uid_sa
    );
  exception when others then
    raise notice 'err=%', sqlerrm;
  end;
  begin execute 'reset role'; exception when others then null; end;

  -- restore policy
  if not exists (
    select 1 from pg_policies where tablename='patients' and policyname='patients_system_admin'
  ) then
    create policy patients_system_admin on public.patients
      for all using (public.is_system_admin())
      with check (public.is_system_admin());
  end if;

  delete from user_practice_roles where user_id = v_uid_sa;
  if jsonb_array_length(v_memb) > 0 then
    insert into user_practice_roles (
      id, user_id, practice_id, role, clinical_access,
      can_cashier, can_schedule_any_practice, can_manage_stock, can_view_care_policies
    )
    select
      (e->>'id')::uuid,
      (e->>'user_id')::uuid,
      (e->>'practice_id')::uuid,
      (e->>'role')::public.app_role,
      coalesce(e->>'clinical_access', 'none')::public.clinical_access,
      coalesce((e->>'can_cashier')::boolean, false),
      coalesce((e->>'can_schedule_any_practice')::boolean, false),
      coalesce((e->>'can_manage_stock')::boolean, false),
      coalesce((e->>'can_view_care_policies')::boolean, false)
    from jsonb_array_elements(v_memb) e;
  end if;
end;
$x$;
