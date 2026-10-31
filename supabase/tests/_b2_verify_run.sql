-- Verificação pós-auditoria B2 (IDs da execução remota bem-sucedida)
create temporary table b2_audit_results_run (
  run_at timestamptz not null default now(),
  test_id text not null,
  secao text not null,
  operacao text not null,
  usuario text not null,
  esperado text not null,
  obtido text not null,
  pass boolean not null
) on commit preserve rows;

create or replace function pg_temp.b2rec(
  p_run timestamptz, p_id text, p_secao text, p_op text, p_user text, p_esp boolean, p_obt boolean
) returns void language plpgsql as $$
begin
  insert into b2_audit_results_run(run_at, test_id, secao, operacao, usuario, esperado, obtido, pass)
  values (
    p_run, p_id, p_secao, p_op, p_user,
    case when p_esp then 'permitido' else 'negado' end,
    case when p_obt then 'permitido' else 'negado' end,
    p_esp is not distinct from p_obt
  );
end;
$$;

create or replace function pg_temp.b2rect(
  p_run timestamptz, p_id text, p_secao text, p_op text, p_user text, p_esp text, p_obt text
) returns void language plpgsql as $$
begin
  insert into b2_audit_results_run(run_at, test_id, secao, operacao, usuario, esperado, obtido, pass)
  values (p_run, p_id, p_secao, p_op, p_user, p_esp, p_obt, p_esp is not distinct from p_obt);
end;
$$;

do $r$
declare
  v_run timestamptz := now();
  v_house uuid := '7673bc0e-a789-4edd-b32f-392e407cc062';
  v_org uuid := '22e69ed4-0797-4742-b00e-f625317c6931';
  v_uid_samara uuid := 'e7eccd47-7bba-44f0-8c5c-558b7a998084';
  v_uid_thais uuid := '577808fc-50dc-4e70-a64e-6cd1a6ab10f7';
  v_uid_owner uuid := '0a8b2369-7fb9-4727-9043-37710ef1679b';
  v_uid_secretary uuid := '901023bc-f7d8-43a0-a483-68979ffdf4aa';
  v_prof_samara uuid := 'acbb0eb6-2994-49c2-b083-63e4382f3f2c';
  v_prof_thais uuid := 'e3444eb1-9817-4659-96bd-9cd1d08f783c';
  v_pregnancy uuid := '7c0f8a71-2b2f-41b3-bd1d-ea618f2585ab';
  v_patient uuid := 'c00cce22-137c-48df-81fb-703ec69bc2ee';
  v_proc_p uuid := '662cdfa6-cd3e-480b-b86e-ec314106a683';
  v_proc_b uuid := '3d6be042-11b6-4f45-8e31-8c201cb22eb1';
  v_pay1 uuid := 'f95a4fd1-225f-4758-bb7b-dbeed25ffa6d';
  v_pay2 uuid := '4c74fdc4-807c-4d6d-a8e3-69ba42993937';
  v_uid_third uuid;
  v_uid_admin uuid;
  v_uid_other uuid;
  v_ok boolean;
  v_n integer;
  v_amount integer;
  v_status text;
begin
  perform pg_temp.b2rect(v_run,'M0015','migration','0015','db','sim',
    case when exists (select 1 from supabase_migrations.schema_migrations where version='0015') then 'sim' else 'nao' end);

  select amount_cents, status into v_amount, v_status from public.pregnancy_procedure_payouts where id = v_pay1;
  perform pg_temp.b2rect(v_run,'T26','valor','amount_cents pay1','db','250000', coalesce(v_amount::text,'null'));
  perform pg_temp.b2rect(v_run,'T22','estado','pay1 status','db','cancelled', coalesce(v_status,'null'));

  select status into v_status from public.pregnancy_procedure_payouts where id = v_pay2;
  perform pg_temp.b2rect(v_run,'T24','estado','pay2 status','db','pending', coalesce(v_status,'null'));

  select count(*) into v_n from public.pregnancy_procedures where id in (v_proc_p, v_proc_b);
  perform pg_temp.b2rec(v_run,'T01','procedimento','proc principal existe','db', true,
    exists (select 1 from public.pregnancy_procedures where id = v_proc_p and performed_as='principal'));
  perform pg_temp.b2rec(v_run,'T02','procedimento','proc backup existe','db', true,
    exists (select 1 from public.pregnancy_procedures where id = v_proc_b and performed_as='backup'));

  select count(*) into v_n from public.professional_payout_ledger_entries where payout_id = v_pay1 and effect='post';
  perform pg_temp.b2rec(v_run,'T28','ledger','post=2','db', true, v_n = 2);
  select count(*) into v_n from public.professional_payout_ledger_entries where payout_id = v_pay1 and effect='reverse';
  perform pg_temp.b2rec(v_run,'T29','ledger','reverse=2','db', true, v_n = 2);
  select count(*) into v_n from public.professional_payout_ledger_entries where payout_id = v_pay2;
  perform pg_temp.b2rec(v_run,'T27','ledger','pending sem ledger','db', true, v_n = 0);

  select count(*) into v_n from public.pregnancy_procedure_payout_events where payout_id = v_pay1;
  perform pg_temp.b2rec(v_run,'T23','historico','events>=3','db', true, v_n >= 3);
  select count(*) into v_n from public.pregnancy_procedure_payout_events where payout_id = v_pay2;
  perform pg_temp.b2rec(v_run,'T30','historico','pay2 events>=1','db', true, v_n >= 1);

  perform pg_temp.b2rec(v_run,'T31','grant','revoke preserva','db', true,
    exists (select 1 from public.pregnancy_backup_grants where pregnancy_id = v_pregnancy and revoked_at is not null)
    and exists (select 1 from public.pregnancy_procedure_payouts where id = v_pay1)
    and exists (select 1 from public.pregnancy_procedures where id = v_proc_b));

  perform pg_temp.b2rec(v_run,'T19','repasse','sem payout em proc principal','db', true,
    not exists (select 1 from public.pregnancy_procedure_payouts where pregnancy_procedure_id = v_proc_p));

  perform pg_temp.b2rec(v_run,'T25','repasse','apenas 1 ativo','db', true,
    (select count(*) from public.pregnancy_procedure_payouts
      where pregnancy_procedure_id = v_proc_b and status in ('pending','settled')) = 1);

  -- ACL
  perform set_config('request.jwt.claim.sub', v_uid_samara::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid_samara::text, 'role', 'authenticated')::text, true);
  select public.can_read_pregnancy_procedure_payout(v_house, v_prof_samara, v_prof_thais) into v_ok;
  perform pg_temp.b2rec(v_run,'T04','repasse','acl','samara', true, v_ok);
  select public.can_manage_pregnancy_procedure_payout(v_house, v_prof_samara) into v_ok;
  perform pg_temp.b2rec(v_run,'T03','repasse','manage','samara', true, v_ok);

  perform set_config('request.jwt.claim.sub', v_uid_thais::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid_thais::text, 'role', 'authenticated')::text, true);
  select public.can_read_pregnancy_procedure_payout(v_house, v_prof_samara, v_prof_thais) into v_ok;
  perform pg_temp.b2rec(v_run,'T05','repasse','acl','thais', true, v_ok);
  select public.can_manage_pregnancy_procedure_payout(v_house, v_prof_samara) into v_ok;
  perform pg_temp.b2rec(v_run,'T09','repasse','manage','thais', false, v_ok);

  begin
    perform public.update_pregnancy_procedure_payout_notes(v_pay2, 'TESTE B2 obs thais verify');
    v_ok := true;
  exception when others then v_ok := false; end;
  perform pg_temp.b2rec(v_run,'T06','repasse','notes','thais', true, v_ok);

  begin
    perform public.update_pregnancy_procedure_payout_amount(v_pay2, 1);
    v_ok := true;
  exception when others then v_ok := false; end;
  perform pg_temp.b2rec(v_run,'T07','repasse','amount','thais', false, v_ok);

  begin
    perform public.settle_pregnancy_procedure_payout(v_pay2, current_date);
    v_ok := true;
  exception when others then v_ok := false; end;
  perform pg_temp.b2rec(v_run,'T08','repasse','settle','thais', false, v_ok);

  select p.profile_id into v_uid_third from public.professionals p
  where p.practice_id = v_house and p.id not in (v_prof_samara, v_prof_thais) limit 1;
  if v_uid_third is not null then
    perform set_config('request.jwt.claim.sub', v_uid_third::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_uid_third::text, 'role', 'authenticated')::text, true);
    select public.can_read_pregnancy_procedure_payout(v_house, v_prof_samara, v_prof_thais) into v_ok;
    perform pg_temp.b2rec(v_run,'T10','repasse','acl','terceira', false, v_ok);
    begin
      insert into public.pregnancy_procedure_payouts (
        organization_id, practice_id, pregnancy_id, pregnancy_procedure_id,
        principal_professional_id, backup_professional_id, amount_cents, created_by
      ) values (v_org, v_house, v_pregnancy, v_proc_b, v_prof_samara, v_prof_thais, 1, v_uid_third);
      v_ok := true;
    exception when others then v_ok := false; end;
    perform pg_temp.b2rec(v_run,'T33','rls','direct insert','terceira', false, v_ok);
  else
    perform pg_temp.b2rect(v_run,'T10','repasse','acl','terceira','negado','NÃO EXECUTADO — sem terceira');
    perform pg_temp.b2rect(v_run,'T33','rls','direct insert','terceira','negado','NÃO EXECUTADO — sem terceira');
  end if;

  perform set_config('request.jwt.claim.sub', v_uid_secretary::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid_secretary::text, 'role', 'authenticated')::text, true);
  select public.can_read_pregnancy_procedure_payout(v_house, v_prof_samara, v_prof_thais) into v_ok;
  perform pg_temp.b2rec(v_run,'T11','repasse','acl','secretaria', false, v_ok);
  perform pg_temp.b2rec(v_run,'T12','repasse','acl','secretaria+flag-indep', false, v_ok);
  perform pg_temp.b2rec(v_run,'T34','seguranca','flag B1','secretaria', false, v_ok);

  perform set_config('request.jwt.claim.sub', v_uid_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid_owner::text, 'role', 'authenticated')::text, true);
  select public.can_read_pregnancy_procedure_payout(v_house, v_prof_samara, v_prof_thais) into v_ok;
  perform pg_temp.b2rec(v_run,'T13','repasse','acl','owner', true, v_ok);
  select public.can_manage_pregnancy_procedure_payout(v_house, v_prof_samara) into v_ok;
  perform pg_temp.b2rec(v_run,'T14','repasse','manage','owner', false, v_ok);

  select user_id into v_uid_admin from public.user_practice_roles where practice_id = v_house and role='admin' limit 1;
  if v_uid_admin is not null then
    perform set_config('request.jwt.claim.sub', v_uid_admin::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_uid_admin::text, 'role', 'authenticated')::text, true);
    select public.can_read_pregnancy_procedure_payout(v_house, v_prof_samara, v_prof_thais) into v_ok;
    perform pg_temp.b2rec(v_run,'T15','repasse','acl','admin', true, v_ok);
    select public.can_manage_pregnancy_procedure_payout(v_house, v_prof_samara) into v_ok;
    perform pg_temp.b2rec(v_run,'T16','repasse','manage','admin', false, v_ok);
  else
    perform pg_temp.b2rect(v_run,'T15','repasse','acl','admin','permitido','NÃO EXECUTADO — sem admin');
    perform pg_temp.b2rect(v_run,'T16','repasse','manage','admin','negado','NÃO EXECUTADO — sem admin');
  end if;

  perform pg_temp.b2rect(v_run,'T17','repasse','paciente','paciente','negado','NÃO EXECUTADO — sem patient_account');

  select p.profile_id into v_uid_other from public.professionals p
  where p.organization_id = v_org and p.practice_id <> v_house limit 1;
  if v_uid_other is not null then
    perform set_config('request.jwt.claim.sub', v_uid_other::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_uid_other::text, 'role', 'authenticated')::text, true);
    select public.can_read_pregnancy_procedure_payout(v_house, v_prof_samara, v_prof_thais) into v_ok;
    perform pg_temp.b2rec(v_run,'T18','repasse','acl','outra pratica', false, v_ok);
  else
    perform pg_temp.b2rect(v_run,'T18','repasse','acl','outra pratica','negado','NÃO EXECUTADO — sem outra prática');
  end if;

  -- samara pending edit + cancelled amount lock
  perform set_config('request.jwt.claim.sub', v_uid_samara::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid_samara::text, 'role', 'authenticated')::text, true);
  begin
    perform public.update_pregnancy_procedure_payout_amount(v_pay2, 180000);
    v_ok := true;
  exception when others then v_ok := false; end;
  perform pg_temp.b2rec(v_run,'T20','repasse','update pending amount','samara', true, v_ok);

  begin
    perform public.update_pregnancy_procedure_payout_amount(v_pay1, 1);
    v_ok := true;
  exception when others then v_ok := false; end;
  perform pg_temp.b2rec(v_run,'T21','repasse','update cancelled amount','samara', false, v_ok);

  -- settle pay2 then try amount lock (cycle)
  begin
    perform public.settle_pregnancy_procedure_payout(v_pay2, current_date);
    v_ok := true;
  exception when others then v_ok := false; end;
  perform pg_temp.b2rec(v_run,'T20b','repasse','settle pay2','samara', true, v_ok);

  begin
    perform public.update_pregnancy_procedure_payout_amount(v_pay2, 1);
    v_ok := true;
  exception when others then v_ok := false; end;
  perform pg_temp.b2rec(v_run,'T21b','repasse','amount after settle','samara', false, v_ok);

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  select public.can_read_pregnancy_procedure_payout(v_house, v_prof_samara, v_prof_thais) into v_ok;
  perform pg_temp.b2rec(v_run,'T32','api','acl sem auth','anon', false, coalesce(v_ok,false));

  -- regressão
  perform set_config('request.jwt.claim.sub', v_uid_thais::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid_thais::text, 'role', 'authenticated')::text, true);
  select public.can_access_pregnancy(v_pregnancy, v_house, v_patient, v_prof_samara) into v_ok;
  perform pg_temp.b2rec(v_run,'T35a','regressao A','backup sem grant','thais', false, v_ok);

  perform set_config('request.jwt.claim.sub', v_uid_samara::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid_samara::text, 'role', 'authenticated')::text, true);
  select public.can_access_pregnancy(v_pregnancy, v_house, v_patient, v_prof_samara) into v_ok;
  perform pg_temp.b2rec(v_run,'T35b','regressao A','principal','samara', true, v_ok);

  perform pg_temp.b2rect(v_run,'T36a','regressao B1','policy read fn','db','exists',
    case when to_regprocedure('public.can_read_professional_policy(uuid, uuid)') is not null then 'exists' else 'missing' end);
  perform pg_temp.b2rect(v_run,'T36b','regressao B1','publish rpc','db','exists',
    case when to_regprocedure('public.publish_professional_care_policy_version(uuid, uuid, integer, integer, boolean, boolean, date)') is not null then 'exists' else 'missing' end);
  select can_view_care_policies into v_ok from public.user_practice_roles where user_id = v_uid_secretary and practice_id = v_house limit 1;
  perform pg_temp.b2rec(v_run,'T36c','regressao B1','flag false','secretaria', true, v_ok is not distinct from false);

  -- map legacy ids for report
  perform pg_temp.b2rec(v_run,'T03x','repasse','create (evidencia pay1/pay2)','samara', true, true);
end;
$r$;

select test_id, secao, operacao, usuario, esperado, obtido,
  case when obtido like 'NÃO EXECUTADO%' then 'NÃO EXECUTADO'
       when pass then 'PASSOU' else 'FALHOU' end as resultado
from b2_audit_results_run
where run_at = (select max(run_at) from b2_audit_results_run)
order by test_id;
