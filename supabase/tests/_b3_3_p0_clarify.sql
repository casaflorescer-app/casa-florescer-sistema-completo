-- Clarify residual patient access after dropping SA god-mode
do $x$
declare
  v_uid_sa uuid := '0a8b2369-7fb9-4727-9043-37710ef1679b';
  v_patient_a uuid := 'b3000010-0000-4000-8000-0000000000b3';
  v_memb jsonb;
  v_n_all int;
  v_n_other int;
  v_n_a int;
  v_created_by uuid;
begin
  select coalesce(jsonb_agg(to_jsonb(upr)), '[]'::jsonb) into v_memb
  from user_practice_roles upr where user_id = v_uid_sa;

  select created_by into v_created_by from patients where id = v_patient_a;

  delete from user_practice_roles where user_id = v_uid_sa;
  drop policy if exists patients_system_admin on public.patients;

  perform set_config('request.jwt.claim.sub', v_uid_sa::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_uid_sa::text, 'role', 'authenticated', 'aud', 'authenticated')::text,
    true
  );

  execute 'set local role authenticated';
  execute 'select count(*)::int from patients' into v_n_all;
  execute 'select count(*)::int from patients where created_by is distinct from auth.uid()' into v_n_other;
  execute format('select count(*)::int from patients where id = %L', v_patient_a) into v_n_a;
  execute 'reset role';

  -- restore
  create policy patients_system_admin on public.patients
    for all using (public.is_system_admin())
    with check (public.is_system_admin());

  delete from user_practice_roles where user_id = v_uid_sa;
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

  insert into public._teste_b33_p0_results(test_id, secao, operacao, esperado, obtido, pass, detail)
  values
    ('P0_OTHER','p0','SA sem memb patients created_by<>self','0',
      v_n_other::text, v_n_other = 0,
      format('n_all=%s n_other=%s patient_a_created_by=%s n_a=%s', v_n_all, v_n_other, v_created_by, v_n_a))
  on conflict (test_id) do update set
    obtido=excluded.obtido, pass=excluded.pass, detail=excluded.detail,
    esperado=excluded.esperado, secao=excluded.secao, operacao=excluded.operacao;
end;
$x$;

select test_id, esperado, obtido, pass, detail
from public._teste_b33_p0_results
where test_id in ('P0_BEFORE','P0_AFTER','P0_OTHER','P0_LINK')
order by test_id;
