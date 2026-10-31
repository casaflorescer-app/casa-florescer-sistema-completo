-- PÓS-0016 — P0 + regressão A/B1/B2 (restore membership SA; não recria god-mode)
drop table if exists public._teste_b33_post16_results;
create table public._teste_b33_post16_results (
  seq integer generated always as identity,
  test_id text primary key,
  secao text not null,
  operacao text not null,
  esperado text not null,
  obtido text not null,
  pass boolean not null,
  detail text
);

create or replace function pg_temp.rec(
  p_id text, p_secao text, p_op text, p_esperado text, p_obtido text, p_detail text default null
) returns void language plpgsql as $$
begin
  insert into public._teste_b33_post16_results(test_id, secao, operacao, esperado, obtido, pass, detail)
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

create or replace function pg_temp.clear_auth() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

do $audit$
declare
  v_house uuid := '7673bc0e-a789-4edd-b32f-392e407cc062';
  v_practice_b uuid := 'b3000001-0000-4000-8000-0000000000b3';
  v_uid_samara uuid := 'e7eccd47-7bba-44f0-8c5c-558b7a998084';
  v_uid_thais uuid := '577808fc-50dc-4e70-a64e-6cd1a6ab10f7';
  v_uid_sa uuid := '0a8b2369-7fb9-4727-9043-37710ef1679b';
  v_uid_med_b uuid := 'b3000002-0000-4000-8000-0000000000b3';
  v_uid_sec_yes uuid := 'b3000005-0000-4000-8000-0000000000b3';
  v_uid_sec_no uuid := 'b3000004-0000-4000-8000-0000000000b3';
  v_uid_inactive uuid := 'b3000006-0000-4000-8000-0000000000b3';
  v_uid_nomemb uuid := 'b3000007-0000-4000-8000-0000000000b3';
  v_uid_owner uuid := '0a8b2369-7fb9-4727-9043-37710ef1679b';
  v_prof_samara uuid := 'acbb0eb6-2994-49c2-b083-63e4382f3f2c';
  v_prof_thais uuid := 'e3444eb1-9817-4659-96bd-9cd1d08f783c';
  v_prof_b uuid := 'b3000008-0000-4000-8000-0000000000b3';
  v_preg_a uuid := 'b3000012-0000-4000-8000-0000000000b3';
  v_preg_b uuid := 'b3000013-0000-4000-8000-0000000000b3';
  v_patient_a uuid := 'b3000010-0000-4000-8000-0000000000b3';
  v_patient_b uuid := 'b3000011-0000-4000-8000-0000000000b3';
  v_memb_backup jsonb;
  v_memb_yes uuid;
  v_n int;
  v_n_other int;
  v_ok boolean;
  v_err text;
  v_proc uuid;
  v_payout uuid;
  v_had_sa_pat boolean;
  v_had_sa_link boolean;
begin
  -- META: god-mode gone
  select exists (
    select 1 from pg_policies where schemaname='public' and tablename='patients'
      and policyname='patients_system_admin'
  ) into v_had_sa_pat;
  select exists (
    select 1 from pg_policies where schemaname='public' and tablename='patient_practice_links'
      and policyname='patient_practice_links_system_admin'
  ) into v_had_sa_link;
  perform pg_temp.rec('M01','meta','patients_system_admin gone','nao',
    case when v_had_sa_pat then 'sim' else 'nao' end, null);
  perform pg_temp.rec('M02','meta','links_system_admin gone','nao',
    case when v_had_sa_link then 'sim' else 'nao' end, null);

  select count(*) into v_n from pg_policies
    where schemaname='public' and tablename='patients';
  perform pg_temp.rec('M03','meta','patients policy count >=4','sim',
    case when v_n >= 4 then 'sim' else 'nao' end, v_n::text);

  -- Ensure inactive flag for inactive fixture
  update profiles set is_active = false where id = v_uid_inactive;

  select id into v_memb_yes from user_practice_roles
    where user_id=v_uid_sec_yes and practice_id=v_house and role='secretary';

  -- Backup SA memberships
  select coalesce(jsonb_agg(to_jsonb(upr)), '[]'::jsonb) into v_memb_backup
  from user_practice_roles upr where user_id = v_uid_sa;

  -- ===== P0: SA without clinical membership =====
  delete from user_practice_roles where user_id = v_uid_sa;

  perform pg_temp.impersonate(v_uid_sa);
  select public.is_system_admin() into v_ok;
  perform pg_temp.rec('P0_SA','p0','is_system_admin sem memb','sim',
    case when coalesce(v_ok,false) then 'sim' else 'nao' end, null);

  v_err := null;
  begin
    execute 'set local role authenticated';
    execute 'select count(*)::int from patients' into v_n;
    execute 'select count(*)::int from patients where created_by is distinct from auth.uid()' into v_n_other;
  exception when others then
    v_n := -1; v_n_other := -1; v_err := sqlerrm;
  end;
  begin execute 'reset role'; exception when others then null; end;
  perform pg_temp.rec('P0_PAT_OTHER','p0','SA sem memb patients created_by<>self','0',
    coalesce(v_n_other::text,'err'), format('n_all=%s err=%s', v_n, coalesce(v_err,'')));

  v_err := null;
  begin
    execute 'set local role authenticated';
    execute 'select count(*)::int from patient_practice_links' into v_n;
    v_ok := (coalesce(v_n,0) > 0);
  exception when others then
    v_ok := false; v_n := -1; v_err := sqlerrm;
  end;
  begin execute 'reset role'; exception when others then null; end;
  perform pg_temp.rec('P0_LINK','p0','SA sem memb SELECT links','bloqueado',
    case when v_ok then 'permitido' else 'bloqueado' end, format('n=%s %s', v_n, coalesce(v_err,'')));

  -- INSERT attempt
  v_err := null;
  begin
    execute 'set local role authenticated';
    insert into patients (organization_id, full_name, created_by)
    values ('22e69ed4-0797-4742-b00e-f625317c6931', 'TESTE B3.3 POS16 — SA insert', v_uid_sa);
    v_ok := true;
  exception when others then
    v_ok := false; v_err := sqlerrm;
  end;
  begin execute 'reset role'; exception when others then null; end;
  perform pg_temp.rec('P0_INS','p0','SA sem memb INSERT patients','bloqueado',
    case when v_ok then 'permitido' else 'bloqueado' end, left(coalesce(v_err,''),120));

  -- UPDATE attempt on third-party patient if visible
  v_err := null;
  begin
    execute 'set local role authenticated';
    update patients set full_name = full_name where id = v_patient_b;
    get diagnostics v_n = row_count;
    v_ok := (v_n > 0);
  exception when others then
    v_ok := false; v_err := sqlerrm; v_n := -1;
  end;
  begin execute 'reset role'; exception when others then null; end;
  perform pg_temp.rec('P0_UPD','p0','SA sem memb UPDATE patient_b','bloqueado',
    case when v_ok then 'permitido' else 'bloqueado' end, format('n=%s %s', v_n, left(coalesce(v_err,''),80)));

  -- DELETE attempt
  v_err := null;
  begin
    execute 'set local role authenticated';
    delete from patients where id = v_patient_b and full_name like 'TESTE%IMPOSSIBLE%';
    get diagnostics v_n = row_count;
    v_ok := (v_n > 0);
  exception when others then
    v_ok := false; v_err := sqlerrm; v_n := -1;
  end;
  begin execute 'reset role'; exception when others then null; end;
  perform pg_temp.rec('P0_DEL','p0','SA sem memb DELETE patient_b','bloqueado',
    case when v_ok then 'permitido' else 'bloqueado' end, format('n=%s %s', v_n, left(coalesce(v_err,''),80)));

  select public.can_access_pregnancy(v_preg_a, v_house, v_patient_a, v_prof_samara) into v_ok;
  perform pg_temp.rec('P0_PREG','p0','SA sem memb pregnancy','bloqueado',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  select public.can_view_practice_care_policies(v_house) into v_ok;
  perform pg_temp.rec('P0_POL','p0','SA sem memb care policies','bloqueado',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  select public.can_read_pregnancy_procedure_payout(v_house, v_prof_samara, v_prof_thais) into v_ok;
  perform pg_temp.rec('P0_PAY','p0','SA sem memb payout ACL','bloqueado',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  -- Restore SA memberships (OWNER)
  delete from user_practice_roles where user_id = v_uid_sa;
  if jsonb_array_length(v_memb_backup) > 0 then
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
    from jsonb_array_elements(v_memb_backup) e;
  end if;

  -- ===== SA + OWNER =====
  perform pg_temp.impersonate(v_uid_sa);
  select public.has_practice_role(v_house, array['owner']::public.app_role[]) into v_ok;
  perform pg_temp.rec('OWN01','owner','SA+OWNER has_practice_role owner','permitido',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  select public.can_access_pregnancy(v_preg_a, v_house, v_patient_a, v_prof_samara) into v_ok;
  perform pg_temp.rec('OWN02','owner','SA+OWNER can_access_pregnancy','permitido',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  begin
    execute 'set local role authenticated';
    execute 'select count(*)::int from patients' into v_n;
    v_ok := (coalesce(v_n,0) > 0);
  exception when others then
    v_ok := false; v_n := -1;
  end;
  begin execute 'reset role'; exception when others then null; end;
  perform pg_temp.rec('OWN03','owner','SA+OWNER SELECT patients','permitido',
    case when v_ok then 'permitido' else 'bloqueado' end, format('n=%s', v_n));

  -- ===== Isolation / IDOR =====
  perform pg_temp.impersonate(v_uid_med_b);
  select public.can_access_pregnancy(v_preg_a, v_house, v_patient_a, v_prof_samara) into v_ok;
  perform pg_temp.rec('ISO01','isolamento','prática B → gestação A','bloqueado',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  perform pg_temp.impersonate(v_uid_samara);
  select public.can_access_pregnancy(v_preg_b, v_practice_b, v_patient_b, v_prof_b) into v_ok;
  perform pg_temp.rec('ISO02','isolamento','prática A → gestação B','bloqueado',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  perform pg_temp.impersonate(v_uid_med_b);
  begin
    execute 'set local role authenticated';
    execute format('select count(*)::int from patients where id = %L', v_patient_a) into v_n;
  exception when others then
    v_n := -1;
  end;
  begin execute 'reset role'; exception when others then null; end;
  perform pg_temp.rec('IDOR_PAT','idor','medica_b patient_a','bloqueado',
    case when coalesce(v_n,0) <= 0 then 'bloqueado' else 'permitido' end, format('n=%s', v_n));

  select id into v_proc from pregnancy_procedures
    where pregnancy_id = v_preg_a order by created_at desc nulls last limit 1;
  if v_proc is not null then
    begin
      execute 'set local role authenticated';
      execute format('select count(*)::int from pregnancy_procedures where id = %L', v_proc) into v_n;
    exception when others then
      v_n := -1;
    end;
    begin execute 'reset role'; exception when others then null; end;
    perform pg_temp.rec('IDOR_PROC','idor','medica_b procedure_a','bloqueado',
      case when coalesce(v_n,0) <= 0 then 'bloqueado' else 'permitido' end, format('n=%s', v_n));
  else
    perform pg_temp.rec('IDOR_PROC','idor','medica_b procedure_a','skip','skip','sem fixture');
  end if;

  select id into v_payout from pregnancy_procedure_payouts
    where practice_id = v_house order by created_at desc nulls last limit 1;
  if v_payout is not null then
    begin
      execute 'set local role authenticated';
      execute format('select count(*)::int from pregnancy_procedure_payouts where id = %L', v_payout) into v_n;
    exception when others then
      v_n := -1;
    end;
    begin execute 'reset role'; exception when others then null; end;
    perform pg_temp.rec('IDOR_PAY','idor','medica_b payout_a','bloqueado',
      case when coalesce(v_n,0) <= 0 then 'bloqueado' else 'permitido' end, format('n=%s', v_n));
  else
    perform pg_temp.rec('IDOR_PAY','idor','medica_b payout_a','skip','skip','sem fixture');
  end if;

  -- ===== Fase A backup =====
  update pregnancy_backup_grants set revoked_at = coalesce(revoked_at, now())
    where pregnancy_id = v_preg_a and revoked_at is null;
  update pregnancies set status = 'in_care' where id = v_preg_a and status <> 'in_care';

  perform pg_temp.impersonate(v_uid_samara);
  select public.can_access_pregnancy(v_preg_a, v_house, v_patient_a, v_prof_samara) into v_ok;
  perform pg_temp.rec('A01','fase_a','principal pregnancy','permitido',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  perform pg_temp.impersonate(v_uid_thais);
  select public.can_access_pregnancy(v_preg_a, v_house, v_patient_a, v_prof_samara) into v_ok;
  perform pg_temp.rec('A02','fase_a','backup sem grant','bloqueado',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  perform pg_temp.impersonate(v_uid_samara);
  begin
    perform public.grant_pregnancy_backup_access(v_preg_a);
    v_ok := true;
  exception when others then
    v_ok := false; v_err := sqlerrm;
  end;
  perform pg_temp.rec('A03','fase_a','grant','permitido',
    case when v_ok then 'permitido' else 'bloqueado' end, left(coalesce(v_err,''),100));

  perform pg_temp.impersonate(v_uid_thais);
  select public.can_access_pregnancy(v_preg_a, v_house, v_patient_a, v_prof_samara) into v_ok;
  perform pg_temp.rec('A04','fase_a','backup com grant','permitido',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  perform pg_temp.impersonate(v_uid_samara);
  perform public.revoke_pregnancy_backup_access(v_preg_a);
  perform pg_temp.impersonate(v_uid_thais);
  select public.can_access_pregnancy(v_preg_a, v_house, v_patient_a, v_prof_samara) into v_ok;
  perform pg_temp.rec('A05','fase_a','backup após revoke','bloqueado',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  select count(*) into v_n from pregnancy_backup_grants where pregnancy_id = v_preg_a;
  perform pg_temp.rec('A06','fase_a','histórico grants permanece','sim',
    case when v_n >= 1 then 'sim' else 'nao' end, v_n::text);

  -- ===== B1 secretary =====
  perform pg_temp.impersonate(v_uid_owner);
  begin
    perform public.set_secretary_care_policy_view(v_memb_yes, false);
  exception when others then null;
  end;
  perform pg_temp.impersonate(v_uid_sec_yes);
  select public.can_view_practice_care_policies(v_house) into v_ok;
  perform pg_temp.rec('B1_01','b1','sec flag=false view','bloqueado',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  perform pg_temp.impersonate(v_uid_owner);
  perform public.set_secretary_care_policy_view(v_memb_yes, true);
  perform pg_temp.impersonate(v_uid_sec_yes);
  select public.can_view_practice_care_policies(v_house) into v_ok;
  perform pg_temp.rec('B1_02','b1','sec flag=true view','permitido',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  begin
    perform public.publish_professional_care_policy_version(
      v_prof_samara, v_house, 1, 1, false, false, current_date);
    v_ok := true;
  exception when others then
    v_ok := false; v_err := sqlerrm;
  end;
  perform pg_temp.rec('B1_03','b1','sec publish','bloqueado',
    case when v_ok then 'permitido' else 'bloqueado' end, left(coalesce(v_err,''),100));

  select public.can_read_pregnancy_procedure_payout(v_house, v_prof_samara, v_prof_thais) into v_ok;
  perform pg_temp.rec('B1_04','b1','sec payout even with flag','bloqueado',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  perform pg_temp.impersonate(v_uid_samara);
  select public.can_view_practice_care_policies(v_house) into v_ok;
  perform pg_temp.rec('B1_05','b1','physician view policies','permitido',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  -- ===== B2 secretary DML deny =====
  perform pg_temp.impersonate(v_uid_sec_yes);
  begin
    execute 'set local role authenticated';
    insert into pregnancy_procedure_payouts (
      organization_id, practice_id, pregnancy_id, pregnancy_procedure_id,
      principal_professional_id, backup_professional_id, amount_cents, created_by
    ) values (
      '22e69ed4-0797-4742-b00e-f625317c6931', v_house, v_preg_a, coalesce(v_proc, gen_random_uuid()),
      v_prof_samara, v_prof_thais, 1, v_uid_sec_yes
    );
    v_ok := true;
  exception when others then
    v_ok := false; v_err := sqlerrm;
  end;
  begin execute 'reset role'; exception when others then null; end;
  perform pg_temp.rec('B2_01','b2','sec INSERT payout','bloqueado',
    case when v_ok then 'permitido' else 'bloqueado' end, left(coalesce(v_err,''),120));

  perform pg_temp.impersonate(v_uid_med_b);
  select public.can_read_pregnancy_procedure_payout(v_house, v_prof_samara, v_prof_thais) into v_ok;
  perform pg_temp.rec('B2_02','b2','prática B lê payout A','bloqueado',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  -- inactive / nomemb
  perform pg_temp.impersonate(v_uid_inactive);
  select public.has_practice_role(v_house, array['secretary']::public.app_role[]) into v_ok;
  perform pg_temp.rec('IN01','auth','inactive has_practice_role','bloqueado',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  perform pg_temp.impersonate(v_uid_nomemb);
  select public.can_access_pregnancy(v_preg_a, v_house, v_patient_a, v_prof_samara) into v_ok;
  perform pg_temp.rec('IN02','auth','nomemb pregnancy','bloqueado',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  perform pg_temp.clear_auth();
exception when others then
  -- ensure membership restore on unexpected error
  begin
    if not exists (select 1 from user_practice_roles where user_id = v_uid_sa) then
      if jsonb_array_length(v_memb_backup) > 0 then
        insert into user_practice_roles (
          id, user_id, practice_id, role, clinical_access,
          can_cashier, can_schedule_any_practice, can_manage_stock, can_view_care_policies
        )
        select
          (e->>'id')::uuid, (e->>'user_id')::uuid, (e->>'practice_id')::uuid,
          (e->>'role')::public.app_role,
          coalesce(e->>'clinical_access', 'none')::public.clinical_access,
          coalesce((e->>'can_cashier')::boolean, false),
          coalesce((e->>'can_schedule_any_practice')::boolean, false),
          coalesce((e->>'can_manage_stock')::boolean, false),
          coalesce((e->>'can_view_care_policies')::boolean, false)
        from jsonb_array_elements(v_memb_backup) e;
      end if;
    end if;
  exception when others then null;
  end;
  raise;
end;
$audit$;

select test_id, secao, operacao, esperado, obtido, pass, detail
from public._teste_b33_post16_results
order by seq;
