-- TESTE B3.3 — P0 critical (SA god-mode patients) + IDOR
-- Save/restore membership + policies. Does NOT leave 0016 applied.
-- Results: public._teste_b33_p0_results (fictional audit table)

drop table if exists public._teste_b33_p0_results;
create table public._teste_b33_p0_results (
  seq integer generated always as identity,
  test_id text primary key,
  secao text not null,
  operacao text not null,
  esperado text not null,
  obtido text not null,
  pass boolean not null,
  detail text
);

create or replace function pg_temp.rec_p0(
  p_id text, p_secao text, p_op text, p_esperado text, p_obtido text, p_detail text default null
) returns void language plpgsql as $$
begin
  insert into public._teste_b33_p0_results(test_id, secao, operacao, esperado, obtido, pass, detail)
  values (p_id, p_secao, p_op, p_esperado, p_obtido, p_esperado is not distinct from p_obtido, p_detail)
  on conflict (test_id) do update set
    secao=excluded.secao, operacao=excluded.operacao,
    esperado=excluded.esperado, obtido=excluded.obtido, pass=excluded.pass, detail=excluded.detail;
end;
$$;

create or replace function pg_temp.impersonate(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated', 'aud', 'authenticated')::text,
    true
  );
end;
$$;

do $p0$
declare
  v_house uuid := '7673bc0e-a789-4edd-b32f-392e407cc062';
  v_uid_samara uuid := 'e7eccd47-7bba-44f0-8c5c-558b7a998084';
  v_uid_thais uuid := '577808fc-50dc-4e70-a64e-6cd1a6ab10f7';
  v_uid_sa uuid := '0a8b2369-7fb9-4727-9043-37710ef1679b';
  v_uid_med_b uuid := 'b3000002-0000-4000-8000-0000000000b3';
  v_prof_samara uuid := 'acbb0eb6-2994-49c2-b083-63e4382f3f2c';
  v_prof_thais uuid := 'e3444eb1-9817-4659-96bd-9cd1d08f783c';
  v_preg_a uuid := 'b3000012-0000-4000-8000-0000000000b3';
  v_patient_a uuid := 'b3000010-0000-4000-8000-0000000000b3';
  v_n integer;
  v_ok boolean;
  v_err text;
  v_proc uuid;
  v_payout uuid;
  v_pol_count integer;
  v_memb_backup jsonb;
  v_had_patients_sa boolean;
  v_had_links_sa boolean;
begin
  -- Backup SA memberships (restore at end)
  select coalesce(jsonb_agg(to_jsonb(upr)), '[]'::jsonb)
    into v_memb_backup
  from public.user_practice_roles upr
  where upr.user_id = v_uid_sa;

  select exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='patients' and policyname='patients_system_admin'
  ) into v_had_patients_sa;
  select exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='patient_practice_links'
      and policyname='patient_practice_links_system_admin'
  ) into v_had_links_sa;

  perform pg_temp.impersonate(v_uid_sa);
  select public.is_system_admin() into v_ok;
  perform pg_temp.rec_p0('M00','meta','is_system_admin','sim',
    case when coalesce(v_ok,false) then 'sim' else 'nao' end, null);

  select count(*) into v_pol_count from pg_policies
    where schemaname='public' and tablename='patients' and policyname <> 'patients_system_admin';
  perform pg_temp.rec_p0('M01','meta','patients other policies','>=1',
    case when v_pol_count >= 1 then '>=1' else '0' end, v_pol_count::text);

  select count(*) into v_pol_count from pg_policies
    where schemaname='public' and tablename='patient_practice_links'
      and policyname <> 'patient_practice_links_system_admin';
  perform pg_temp.rec_p0('M02','meta','links other policies','>=1',
    case when v_pol_count >= 1 then '>=1' else '0' end, v_pol_count::text);

  -- Simulate SA without clinical membership
  delete from public.user_practice_roles where user_id = v_uid_sa;

  -- BEFORE 0016
  v_err := null;
  perform pg_temp.impersonate(v_uid_sa);
  begin
    execute 'set local role authenticated';
    execute 'select count(*)::int from public.patients' into v_n;
    v_ok := (coalesce(v_n,0) > 0);
  exception when others then
    v_ok := false; v_err := sqlerrm; v_n := -1;
  end;
  begin execute 'reset role'; exception when others then null; end;
  perform pg_temp.rec_p0('P0_BEFORE','p0','SA sem memb SELECT patients','permitido',
    case when v_ok then 'permitido' else 'bloqueado' end,
    format('n=%s err=%s', v_n, coalesce(v_err,'')));

  -- Simulate 0016
  drop policy if exists patients_system_admin on public.patients;
  drop policy if exists patient_practice_links_system_admin on public.patient_practice_links;

  -- AFTER 0016
  v_err := null;
  perform pg_temp.impersonate(v_uid_sa);
  begin
    execute 'set local role authenticated';
    execute 'select count(*)::int from public.patients' into v_n;
    v_ok := (coalesce(v_n,0) > 0);
  exception when others then
    v_ok := false; v_err := sqlerrm; v_n := -1;
  end;
  begin execute 'reset role'; exception when others then null; end;
  perform pg_temp.rec_p0('P0_AFTER','p0','SA sem memb SELECT patients','bloqueado',
    case when v_ok then 'permitido' else 'bloqueado' end,
    format('n=%s err=%s', v_n, coalesce(v_err,'')));

  select public.can_access_pregnancy(v_preg_a, v_house, v_patient_a, v_prof_samara) into v_ok;
  perform pg_temp.rec_p0('P0_PREG','p0','SA sem memb pregnancy','bloqueado',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  select public.can_view_practice_care_policies(v_house) into v_ok;
  perform pg_temp.rec_p0('P0_POL','p0','SA sem memb care policies','bloqueado',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  select public.can_read_pregnancy_procedure_payout(v_house, v_prof_samara, v_prof_thais) into v_ok;
  perform pg_temp.rec_p0('P0_PAY','p0','SA sem memb payout ACL','bloqueado',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  v_err := null;
  begin
    execute 'set local role authenticated';
    execute 'select count(*)::int from public.patient_practice_links' into v_n;
    v_ok := (coalesce(v_n,0) > 0);
  exception when others then
    v_ok := false; v_err := sqlerrm; v_n := -1;
  end;
  begin execute 'reset role'; exception when others then null; end;
  perform pg_temp.rec_p0('P0_LINK','p0','SA sem memb SELECT links','bloqueado',
    case when v_ok then 'permitido' else 'bloqueado' end,
    format('n=%s err=%s', v_n, coalesce(v_err,'')));

  -- IDOR
  perform pg_temp.impersonate(v_uid_med_b);
  begin
    execute 'set local role authenticated';
    execute format('select count(*)::int from public.patients where id = %L', v_patient_a) into v_n;
  exception when others then
    v_n := -1;
  end;
  begin execute 'reset role'; exception when others then null; end;
  perform pg_temp.rec_p0('IDOR_PAT','idor','medica_b patient_a','bloqueado',
    case when coalesce(v_n,0) <= 0 then 'bloqueado' else 'permitido' end, format('n=%s', v_n));

  select public.can_access_pregnancy(v_preg_a, v_house, v_patient_a, v_prof_samara) into v_ok;
  perform pg_temp.rec_p0('IDOR_PREG','idor','medica_b pregnancy_a','bloqueado',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  select id into v_proc from public.pregnancy_procedures
    where pregnancy_id = v_preg_a order by created_at desc nulls last limit 1;
  if v_proc is not null then
    begin
      execute 'set local role authenticated';
      execute format('select count(*)::int from public.pregnancy_procedures where id = %L', v_proc) into v_n;
    exception when others then
      v_n := -1;
    end;
    begin execute 'reset role'; exception when others then null; end;
    perform pg_temp.rec_p0('IDOR_PROC','idor','medica_b procedure_a','bloqueado',
      case when coalesce(v_n,0) <= 0 then 'bloqueado' else 'permitido' end,
      format('proc=%s n=%s', v_proc, v_n));
  else
    perform pg_temp.rec_p0('IDOR_PROC','idor','medica_b procedure_a','skip','skip','sem fixture');
  end if;

  select id into v_payout from public.pregnancy_procedure_payouts
    where practice_id = v_house order by created_at desc nulls last limit 1;
  if v_payout is not null then
    begin
      execute 'set local role authenticated';
      execute format(
        'select count(*)::int from public.pregnancy_procedure_payouts where id = %L', v_payout
      ) into v_n;
    exception when others then
      v_n := -1;
    end;
    begin execute 'reset role'; exception when others then null; end;
    perform pg_temp.rec_p0('IDOR_PAY','idor','medica_b payout_a','bloqueado',
      case when coalesce(v_n,0) <= 0 then 'bloqueado' else 'permitido' end,
      format('payout=%s n=%s', v_payout, v_n));
  else
    perform pg_temp.rec_p0('IDOR_PAY','idor','medica_b payout_a','skip','skip','sem fixture');
  end if;

  -- Restore 0007 policies if we dropped them
  if v_had_patients_sa and not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='patients' and policyname='patients_system_admin'
  ) then
    execute $pol$
      create policy patients_system_admin on public.patients
        for all using (public.is_system_admin())
        with check (public.is_system_admin())
    $pol$;
  end if;

  if v_had_links_sa and not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='patient_practice_links'
      and policyname='patient_practice_links_system_admin'
  ) then
    execute $pol$
      create policy patient_practice_links_system_admin on public.patient_practice_links
        for all using (public.is_system_admin())
        with check (public.is_system_admin())
    $pol$;
  end if;

  -- Restore SA memberships from backup (sem created_at — coluna inexistente)
  delete from public.user_practice_roles where user_id = v_uid_sa;
  if jsonb_array_length(v_memb_backup) > 0 then
    insert into public.user_practice_roles (
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
    from jsonb_array_elements(v_memb_backup) e;
  end if;

  -- After restore: SA+OWNER can access pregnancy via membership
  perform pg_temp.impersonate(v_uid_sa);
  select public.can_access_pregnancy(v_preg_a, v_house, v_patient_a, v_prof_samara) into v_ok;
  perform pg_temp.rec_p0('SA_OWNER','restore','SA+OWNER can_access_pregnancy','permitido',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  -- Owner path for patients still works (samara)
  perform pg_temp.impersonate(v_uid_samara);
  begin
    execute 'set local role authenticated';
    execute format('select count(*)::int from public.patients where id = %L', v_patient_a) into v_n;
    v_ok := (coalesce(v_n,0) > 0);
  exception when others then
    v_ok := false; v_n := -1; v_err := sqlerrm;
  end;
  begin execute 'reset role'; exception when others then null; end;
  perform pg_temp.rec_p0('STAFF_PAT','restore','samara SELECT patient_a','permitido',
    case when v_ok then 'permitido' else 'bloqueado' end, format('n=%s', v_n));

  -- Confirm policies restored
  select exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='patients' and policyname='patients_system_admin'
  ) into v_ok;
  perform pg_temp.rec_p0('REST_POL','restore','patients_system_admin restored','sim',
    case when v_ok then 'sim' else 'nao' end,
    'pre-commit: god-mode ainda ativo ate db push 0016');
end;
$p0$;

select test_id, secao, operacao, esperado, obtido, pass, detail
from public._teste_b33_p0_results
order by seq;
