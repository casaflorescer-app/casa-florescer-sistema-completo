-- B3.3 authorization probes (fictional TESTE B3.3 — where needed)
-- Impersonation via set_config (same pattern as B3 UAT)

create temporary table if not exists b33_results (
  seq integer generated always as identity,
  test_id text primary key,
  secao text not null,
  operacao text not null,
  usuario text not null,
  esperado text not null,
  obtido text not null,
  pass boolean not null,
  detail text
) on commit preserve rows;
truncate b33_results;

create or replace function pg_temp.rec(
  p_id text, p_secao text, p_op text, p_user text,
  p_esperado text, p_obtido text, p_detail text default null
) returns void language plpgsql as $$
begin
  insert into b33_results(test_id, secao, operacao, usuario, esperado, obtido, pass, detail)
  values (p_id, p_secao, p_op, p_user, p_esperado, p_obtido, p_esperado is not distinct from p_obtido, p_detail)
  on conflict (test_id) do update set
    secao=excluded.secao, operacao=excluded.operacao, usuario=excluded.usuario,
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

do $b33$
declare
  v_org uuid := '22e69ed4-0797-4742-b00e-f625317c6931';
  v_house uuid := '7673bc0e-a789-4edd-b32f-392e407cc062';
  v_practice_b uuid := 'b3000001-0000-4000-8000-0000000000b3';
  v_uid_samara uuid := 'e7eccd47-7bba-44f0-8c5c-558b7a998084';
  v_uid_thais uuid := '577808fc-50dc-4e70-a64e-6cd1a6ab10f7';
  v_uid_owner uuid := '0a8b2369-7fb9-4727-9043-37710ef1679b';
  v_uid_sec_no uuid := 'b3000004-0000-4000-8000-0000000000b3';
  v_uid_sec_yes uuid := 'b3000005-0000-4000-8000-0000000000b3';
  v_uid_inactive uuid := 'b3000006-0000-4000-8000-0000000000b3';
  v_uid_nomemb uuid := 'b3000007-0000-4000-8000-0000000000b3';
  v_uid_med_b uuid := 'b3000002-0000-4000-8000-0000000000b3';
  v_prof_samara uuid := 'acbb0eb6-2994-49c2-b083-63e4382f3f2c';
  v_prof_thais uuid := 'e3444eb1-9817-4659-96bd-9cd1d08f783c';
  v_prof_b uuid := 'b3000008-0000-4000-8000-0000000000b3';
  v_preg_a uuid := 'b3000012-0000-4000-8000-0000000000b3';
  v_preg_b uuid := 'b3000013-0000-4000-8000-0000000000b3';
  v_patient_a uuid := 'b3000010-0000-4000-8000-0000000000b3';
  v_patient_b uuid := 'b3000011-0000-4000-8000-0000000000b3';
  v_uid_sa uuid;
  v_ok boolean;
  v_n integer;
  v_err text;
  v_memb_yes uuid;
begin
  -- Ensure inactive flag
  update profiles set is_active = false where id = v_uid_inactive;

  select id into v_memb_yes from user_practice_roles
    where user_id=v_uid_sec_yes and practice_id=v_house and role='secretary';

  select user_id into v_uid_sa from system_admins where revoked_at is null limit 1;

  -- META: helpers exist
  perform pg_temp.rec('M01','meta','has_practice_role requires is_active','db','sim',
    case when pg_get_functiondef('public.has_practice_role(uuid, public.app_role[])'::regprocedure)
      like '%is_active%' then 'sim' else 'nao' end);

  -- INACTIVE: has_practice_role false
  perform pg_temp.impersonate(v_uid_inactive);
  select public.has_practice_role(v_house, array['secretary']::public.app_role[]) into v_ok;
  perform pg_temp.rec('I01','inativo','has_practice_role secretary','inactive','bloqueado',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  select public.can_view_practice_care_policies(v_house) into v_ok;
  perform pg_temp.rec('I02','inativo','can_view_practice_care_policies','inactive','bloqueado',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  -- NO MEMBERSHIP
  perform pg_temp.impersonate(v_uid_nomemb);
  select public.can_access_pregnancy(v_preg_a, v_house, v_patient_a, v_prof_samara) into v_ok;
  perform pg_temp.rec('N01','membership','can_access_pregnancy','nomemb','bloqueado',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  -- PRACTICE ISOLATION
  perform pg_temp.impersonate(v_uid_med_b);
  select public.can_access_pregnancy(v_preg_a, v_house, v_patient_a, v_prof_samara) into v_ok;
  perform pg_temp.rec('P01','isolamento','prática B → gestação A','medica_b','bloqueado',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  perform pg_temp.impersonate(v_uid_samara);
  select public.can_access_pregnancy(v_preg_b, v_practice_b, v_patient_b, v_prof_b) into v_ok;
  perform pg_temp.rec('P02','isolamento','prática A → gestação B','samara','bloqueado',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  -- payout ACL isolation
  perform pg_temp.impersonate(v_uid_med_b);
  select public.can_read_pregnancy_procedure_payout(v_house, v_prof_samara, v_prof_thais) into v_ok;
  perform pg_temp.rec('P03','isolamento','prática B lê payout A','medica_b','bloqueado',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  -- SECRETARY flag
  perform pg_temp.impersonate(v_uid_owner);
  begin
    perform public.set_secretary_care_policy_view(v_memb_yes, false);
  exception when others then null;
  end;
  perform pg_temp.impersonate(v_uid_sec_yes);
  select public.can_view_practice_care_policies(v_house) into v_ok;
  perform pg_temp.rec('S01','secretaria','view policies flag=false','sec_com','bloqueado',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  perform pg_temp.impersonate(v_uid_owner);
  perform public.set_secretary_care_policy_view(v_memb_yes, true);
  perform pg_temp.impersonate(v_uid_sec_yes);
  select public.can_view_practice_care_policies(v_house) into v_ok;
  perform pg_temp.rec('S02','secretaria','view policies flag=true','sec_com','permitido',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  select public.can_read_pregnancy_procedure_payout(v_house, v_prof_samara, v_prof_thais) into v_ok;
  perform pg_temp.rec('S03','secretaria','payout even with flag','sec_com','bloqueado',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  begin
    perform public.publish_professional_care_policy_version(
      v_prof_samara, v_house, 1, 1, false, false, current_date);
    v_ok := true;
  exception when others then
    v_ok := false; v_err := sqlerrm;
  end;
  perform pg_temp.rec('S04','secretaria','publish with flag','sec_com','bloqueado',
    case when v_ok then 'permitido' else 'bloqueado' end, v_err);

  -- BACKUP GRANT
  perform pg_temp.clear_auth();
  update pregnancy_backup_grants set revoked_at = coalesce(revoked_at, now())
    where pregnancy_id = v_preg_a and revoked_at is null;

  -- reopen pregnancy if closed
  update pregnancies set status = 'in_care' where id = v_preg_a and status <> 'in_care';

  perform pg_temp.impersonate(v_uid_thais);
  select public.can_access_pregnancy(v_preg_a, v_house, v_patient_a, v_prof_samara) into v_ok;
  perform pg_temp.rec('R01','retaguarda','thais sem grant','thais','bloqueado',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  perform pg_temp.impersonate(v_uid_samara);
  begin
    perform public.grant_pregnancy_backup_access(v_preg_a);
    v_ok := true;
  exception when others then
    v_ok := false; v_err := sqlerrm;
  end;
  perform pg_temp.rec('R02','retaguarda','grant','samara','permitido',
    case when v_ok then 'permitido' else 'bloqueado' end, v_err);

  perform pg_temp.impersonate(v_uid_thais);
  select public.can_access_pregnancy(v_preg_a, v_house, v_patient_a, v_prof_samara) into v_ok;
  perform pg_temp.rec('R03','retaguarda','thais com grant','thais','permitido',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  perform pg_temp.impersonate(v_uid_samara);
  perform public.revoke_pregnancy_backup_access(v_preg_a);
  perform pg_temp.impersonate(v_uid_thais);
  select public.can_access_pregnancy(v_preg_a, v_house, v_patient_a, v_prof_samara) into v_ok;
  perform pg_temp.rec('R04','retaguarda','thais após revoke','thais','bloqueado',
    case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, null);

  -- SYSTEM_ADMIN vs patients / pregnancies helpers
  if v_uid_sa is not null then
    perform pg_temp.impersonate(v_uid_sa);
    -- RLS: count patients as SA (login role bypasses RLS unless we SET ROLE)
    -- Probe via is_system_admin and policy existence
    select public.is_system_admin() into v_ok;
    perform pg_temp.rec('SA01','system_admin','is_system_admin()','sa','permitido',
      case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end, v_uid_sa::text);

    select public.can_access_pregnancy(v_preg_a, v_house, v_patient_a, v_prof_samara) into v_ok;
    perform pg_temp.rec('SA02','system_admin','can_access_pregnancy (helper)','sa','bloqueado',
      case when coalesce(v_ok,false) then 'permitido' else 'bloqueado' end,
      'helper não inclui SA; policy patients_system_admin é separada');

    select exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='patients' and policyname='patients_system_admin'
    ) into v_ok;
    perform pg_temp.rec('SA03','system_admin','policy patients_system_admin EXISTS','db','sim',
      case when v_ok then 'sim' else 'nao' end, 'FOR ALL via is_system_admin — risco PHI');

    select exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='pregnancies'
        and qual ilike '%is_system_admin%'
    ) into v_ok;
    perform pg_temp.rec('SA04','system_admin','pregnancies policy uses is_system_admin','db','nao',
      case when v_ok then 'sim' else 'nao' end, null);
  else
    perform pg_temp.rec('SA00','system_admin','nenhum SA','db','skip','skip',null);
  end if;

  -- Direct DML attempt on payouts as secretary under authenticated role
  perform pg_temp.impersonate(v_uid_sec_yes);
  begin
    execute 'set local role authenticated';
    insert into pregnancy_procedure_payouts (
      organization_id, practice_id, pregnancy_id, pregnancy_procedure_id,
      principal_professional_id, backup_professional_id, amount_cents, created_by
    ) values (
      v_org, v_house, v_preg_a, gen_random_uuid(),
      v_prof_samara, v_prof_thais, 1, v_uid_sec_yes
    );
    v_ok := true;
  exception when others then
    v_ok := false; v_err := sqlerrm;
  end;
  begin execute 'reset role'; exception when others then null; end;
  perform pg_temp.rec('D01','rls','secretary INSERT payouts','sec_com','bloqueado',
    case when v_ok then 'permitido' else 'bloqueado' end, left(coalesce(v_err,''),160));

  perform pg_temp.clear_auth();
end;
$b33$;

select test_id, secao, operacao, usuario, esperado, obtido, pass, detail
from b33_results
order by seq;
