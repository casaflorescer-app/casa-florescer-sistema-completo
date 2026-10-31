-- =============================================================================
-- Auditoria remota B2 — TESTE B2 (dados fictícios)
-- Executar após 0015 aplicada. NÃO apaga dados reais. NÃO edita 0011–0014.
-- =============================================================================

create temporary table if not exists b2_audit_results (
  seq integer generated always as identity,
  test_id text primary key,
  secao text not null,
  operacao text not null,
  usuario text not null,
  esperado text not null,
  obtido text not null,
  pass boolean not null
) on commit preserve rows;

truncate b2_audit_results;

create or replace function pg_temp.record(
  p_id text, p_secao text, p_op text, p_user text, p_esperado boolean, p_obtido boolean
) returns void language plpgsql as $$
begin
  insert into b2_audit_results (test_id, secao, operacao, usuario, esperado, obtido, pass)
  values (
    p_id, p_secao, p_op, p_user,
    case when p_esperado then 'permitido' else 'negado' end,
    case when p_obtido then 'permitido' else 'negado' end,
    p_esperado is not distinct from p_obtido
  )
  on conflict (test_id) do update set
    secao = excluded.secao, operacao = excluded.operacao, usuario = excluded.usuario,
    esperado = excluded.esperado, obtido = excluded.obtido, pass = excluded.pass;
end;
$$;

create or replace function pg_temp.record_text(
  p_id text, p_secao text, p_op text, p_user text, p_esperado text, p_obtido text
) returns void language plpgsql as $$
begin
  insert into b2_audit_results (test_id, secao, operacao, usuario, esperado, obtido, pass)
  values (p_id, p_secao, p_op, p_user, p_esperado, p_obtido, p_esperado is not distinct from p_obtido)
  on conflict (test_id) do update set
    secao = excluded.secao, operacao = excluded.operacao, usuario = excluded.usuario,
    esperado = excluded.esperado, obtido = excluded.obtido, pass = excluded.pass;
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
  v_org uuid := '22e69ed4-0797-4742-b00e-f625317c6931';
  v_house uuid := '7673bc0e-a789-4edd-b32f-392e407cc062';
  v_uid_samara uuid := 'e7eccd47-7bba-44f0-8c5c-558b7a998084';
  v_uid_thais uuid := '577808fc-50dc-4e70-a64e-6cd1a6ab10f7';
  v_uid_owner uuid := '0a8b2369-7fb9-4727-9043-37710ef1679b';
  v_uid_secretary uuid := '901023bc-f7d8-43a0-a483-68979ffdf4aa';
  v_prof_samara uuid := 'acbb0eb6-2994-49c2-b083-63e4382f3f2c';
  v_prof_thais uuid := 'e3444eb1-9817-4659-96bd-9cd1d08f783c';
  v_uid_third uuid;
  v_prof_third uuid;
  v_uid_other uuid;
  v_prof_other uuid;
  v_practice_other uuid;
  v_uid_admin uuid;
  v_uid_patient uuid;
  v_patient uuid := gen_random_uuid();
  v_pregnancy uuid := gen_random_uuid();
  v_proc_principal uuid;
  v_proc_backup uuid;
  v_payout uuid;
  v_payout2 uuid;
  v_ok boolean;
  v_n integer;
  v_amount integer;
  v_status text;
  v_events integer;
  v_ledger integer;
  v_flag_before boolean;
  v_err text;
begin
  -- Garantir 0015
  if to_regprocedure('public.create_pregnancy_procedure(uuid, text, uuid, date, text)') is null then
    raise exception '0015 nao aplicada';
  end if;

  perform pg_temp.record_text(
    'M0015', 'migration', '0015 aplicada', 'db', 'sim',
    case when exists (select 1 from supabase_migrations.schema_migrations where version = '0015')
      then 'sim' else 'nao' end
  );

  -- Terceira médica da mesma prática (fictícia se não existir)
  select p.id, p.profile_id into v_prof_third, v_uid_third
  from public.professionals p
  join public.profiles pr on pr.id = p.profile_id
  where p.practice_id = v_house
    and p.id not in (v_prof_samara, v_prof_thais)
  limit 1;

  if v_prof_third is null then
    -- criar profissional fictício ligado a um profile existente owner? melhor skip T10 se não houver
    null;
  end if;

  -- Outra prática
  select id into v_practice_other
  from public.practice_units
  where organization_id = v_org and id <> v_house
  limit 1;

  if v_practice_other is not null then
    select p.id, p.profile_id into v_prof_other, v_uid_other
    from public.professionals p
    where p.practice_id = v_practice_other
    limit 1;
  end if;

  select user_id into v_uid_admin
  from public.user_practice_roles
  where practice_id = v_house and role = 'admin'
  limit 1;

  -- Paciente fictícia TESTE B2
  perform pg_temp.impersonate(v_uid_owner);
  insert into public.patients (id, organization_id, full_name, created_by)
  values (v_patient, v_org, 'TESTE B2 — PACIENTE REPASSE 001', v_uid_owner);

  insert into public.patient_practice_links (patient_id, practice_id)
  values (v_patient, v_house)
  on conflict do nothing;

  -- Gestação fictícia Samara principal / Thais retaguarda (created_by = auth.uid)
  perform pg_temp.impersonate(v_uid_samara);
  insert into public.pregnancies (
    id, organization_id, practice_id, patient_id,
    primary_professional_id, backup_professional_id,
    status, lmp_date, notes, created_by
  ) values (
    v_pregnancy, v_org, v_house, v_patient,
    v_prof_samara, v_prof_thais,
    'in_care', current_date - 120,
    'TESTE B2 — gestação fictícia auditoria',
    v_uid_samara
  );

  -- Grant retaguarda via RPC (Samara)
  begin
    perform public.grant_pregnancy_backup_access(v_pregnancy);
  exception when others then
    null;
  end;

  -- Se não há grant ativo, inserir direto (service)
  perform pg_temp.clear_auth();
  if not exists (
    select 1 from public.pregnancy_backup_grants
    where pregnancy_id = v_pregnancy and revoked_at is null
  ) then
    insert into public.pregnancy_backup_grants (
      pregnancy_id, organization_id, practice_id, patient_id,
      principal_professional_id, backup_professional_id, granted_by
    ) values (
      v_pregnancy, v_org, v_house, v_patient,
      v_prof_samara, v_prof_thais, v_uid_samara
    );
  end if;

  -- Seed procedure catalog if missing
  insert into public.procedures (organization_id, practice_id, code, name, duration_min, is_shared)
  values (v_org, null, 'OBSTETRIC_BIRTH', 'Parto obstétrico', 60, true)
  on conflict (organization_id, code) do nothing;

  -- ========== TESTES ==========
  perform pg_temp.impersonate(v_uid_samara);

  -- T01 principal cria procedimento próprio
  begin
    v_proc_principal := public.create_pregnancy_procedure(
      v_pregnancy, 'OBSTETRIC_BIRTH', v_prof_samara, current_date, 'TESTE B2 proc principal'
    );
  exception when others then
    v_proc_principal := null;
  end;
  perform pg_temp.record('T01', 'procedimento', 'create self', 'samara', true, v_proc_principal is not null);

  -- T02 principal cria procedimento da retaguarda
  begin
    v_proc_backup := public.create_pregnancy_procedure(
      v_pregnancy, 'OBSTETRIC_BIRTH', v_prof_thais, current_date, 'TESTE B2 proc retaguarda'
    );
  exception when others then
    v_proc_backup := null;
  end;
  perform pg_temp.record('T02', 'procedimento', 'create backup', 'samara', true, v_proc_backup is not null);

  -- T19 payout on principal procedure blocked
  begin
    v_payout := public.create_pregnancy_procedure_payout(v_proc_principal, 250000, 'nao', null);
  exception when others then
    v_payout := null;
  end;
  perform pg_temp.record('T19', 'repasse', 'payout on principal proc', 'samara', false, v_payout is not null);

  -- T03 create payout
  begin
    v_payout := public.create_pregnancy_procedure_payout(v_proc_backup, 250000, 'TESTE B2 repasse 2500', null);
  exception when others then
    v_payout := null;
  end;
  perform pg_temp.record('T03', 'repasse', 'create payout', 'samara', true, v_payout is not null);

  -- T26 cents
  select amount_cents into v_amount from public.pregnancy_procedure_payouts where id = v_payout;
  perform pg_temp.record_text('T26', 'valor', 'amount_cents', 'db', '250000', coalesce(v_amount::text, 'null'));

  -- T04 samara select (via ACL helper — login role bypassa RLS)
  select public.can_read_pregnancy_procedure_payout(v_house, v_prof_samara, v_prof_thais) into v_ok;
  perform pg_temp.record('T04', 'repasse', 'select/acl', 'samara', true, v_ok);

  -- T05 thais select
  perform pg_temp.impersonate(v_uid_thais);
  select public.can_read_pregnancy_procedure_payout(v_house, v_prof_samara, v_prof_thais) into v_ok;
  perform pg_temp.record('T05', 'repasse', 'select/acl', 'thais', true, v_ok);

  -- T06 thais notes
  begin
    perform public.update_pregnancy_procedure_payout_notes(v_payout, 'TESTE B2 obs retaguarda');
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  perform pg_temp.record('T06', 'repasse', 'update notes', 'thais', true, v_ok);

  -- T07 thais amount blocked
  begin
    perform public.update_pregnancy_procedure_payout_amount(v_payout, 1);
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  perform pg_temp.record('T07', 'repasse', 'update amount', 'thais', false, v_ok);

  -- T08 thais settle blocked
  begin
    perform public.settle_pregnancy_procedure_payout(v_payout, current_date);
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  perform pg_temp.record('T08', 'repasse', 'settle', 'thais', false, v_ok);

  -- T09 thais create payout blocked
  begin
    v_payout2 := public.create_pregnancy_procedure_payout(v_proc_backup, 100, 'thais cria', null);
  exception when others then
    v_payout2 := null;
  end;
  perform pg_temp.record('T09', 'repasse', 'create payout', 'thais', false, v_payout2 is not null);

  -- T10 terceira
  if v_uid_third is not null then
    perform pg_temp.impersonate(v_uid_third);
    select public.can_read_pregnancy_procedure_payout(v_house, v_prof_samara, v_prof_thais) into v_ok;
    perform pg_temp.record('T10', 'repasse', 'select/acl', 'terceira', false, v_ok);
  else
    perform pg_temp.record_text('T10', 'repasse', 'select', 'terceira', 'negado', 'NÃO EXECUTADO — sem terceira na prática');
  end if;

  -- T11 secretária sem flag
  update public.user_practice_roles
  set can_view_care_policies = false
  where user_id = v_uid_secretary and practice_id = v_house
  returning can_view_care_policies into v_flag_before;

  perform pg_temp.impersonate(v_uid_secretary);
  select public.can_read_pregnancy_procedure_payout(v_house, v_prof_samara, v_prof_thais) into v_ok;
  perform pg_temp.record('T11', 'repasse', 'select/acl', 'secretaria', false, v_ok);

  -- T12 / T34 secretária com flag
  perform pg_temp.clear_auth();
  update public.user_practice_roles
  set can_view_care_policies = true
  where user_id = v_uid_secretary and practice_id = v_house;

  perform pg_temp.impersonate(v_uid_secretary);
  select public.can_read_pregnancy_procedure_payout(v_house, v_prof_samara, v_prof_thais) into v_ok;
  perform pg_temp.record('T12', 'repasse', 'select/acl', 'secretaria+flag', false, v_ok);
  perform pg_temp.record('T34', 'seguranca', 'flag B1 nao libera', 'secretaria+flag', false, v_ok);

  -- restaurar flag false
  perform pg_temp.clear_auth();
  update public.user_practice_roles
  set can_view_care_policies = false
  where user_id = v_uid_secretary and practice_id = v_house;

  -- T13 owner
  perform pg_temp.impersonate(v_uid_owner);
  select public.can_read_pregnancy_procedure_payout(v_house, v_prof_samara, v_prof_thais) into v_ok;
  perform pg_temp.record('T13', 'repasse', 'select/acl', 'owner', true, v_ok);

  -- T14 owner edit blocked
  begin
    perform public.update_pregnancy_procedure_payout_amount(v_payout, 999);
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  perform pg_temp.record('T14', 'repasse', 'update amount', 'owner', false, v_ok);

  -- T15/T16 admin
  if v_uid_admin is not null then
    perform pg_temp.impersonate(v_uid_admin);
    select public.can_read_pregnancy_procedure_payout(v_house, v_prof_samara, v_prof_thais) into v_ok;
    perform pg_temp.record('T15', 'repasse', 'select/acl', 'admin', true, v_ok);
    begin
      perform public.settle_pregnancy_procedure_payout(v_payout, current_date);
      v_ok := true;
    exception when others then
      v_ok := false;
    end;
    perform pg_temp.record('T16', 'repasse', 'settle', 'admin', false, v_ok);
  else
    perform pg_temp.record_text('T15', 'repasse', 'select', 'admin', 'permitido', 'NÃO EXECUTADO — sem admin');
    perform pg_temp.record_text('T16', 'repasse', 'settle', 'admin', 'negado', 'NÃO EXECUTADO — sem admin');
  end if;

  -- T17 paciente portal se existir
  select pa.user_id into v_uid_patient
  from public.patient_accounts pa
  where pa.patient_id = v_patient
  limit 1;
  if v_uid_patient is null then
    perform pg_temp.record_text('T17', 'repasse', 'select', 'paciente', 'negado', 'NÃO EXECUTADO — sem patient_account');
  else
    perform pg_temp.impersonate(v_uid_patient);
    select public.can_read_pregnancy_procedure_payout(v_house, v_prof_samara, v_prof_thais) into v_ok;
    perform pg_temp.record('T17', 'repasse', 'select/acl', 'paciente', false, v_ok);
  end if;

  -- T18 outra prática
  if v_uid_other is not null then
    perform pg_temp.impersonate(v_uid_other);
    select public.can_read_pregnancy_procedure_payout(v_house, v_prof_samara, v_prof_thais) into v_ok;
    perform pg_temp.record('T18', 'repasse', 'select/acl', 'outra pratica', false, v_ok);
  else
    perform pg_temp.record_text('T18', 'repasse', 'select', 'outra pratica', 'negado', 'NÃO EXECUTADO — sem outra prática');
  end if;

  -- T27 pending no ledger
  perform pg_temp.impersonate(v_uid_samara);
  select count(*) into v_ledger from public.professional_payout_ledger_entries where payout_id = v_payout;
  perform pg_temp.record('T27', 'ledger', 'pending no post', 'samara', true, v_ledger = 0);

  -- T20 settle
  begin
    perform public.settle_pregnancy_procedure_payout(v_payout, current_date);
    v_ok := true;
  exception when others then
    v_ok := false;
    get stacked diagnostics v_err = message_text;
  end;
  perform pg_temp.record('T20', 'repasse', 'settle', 'samara', true, v_ok);

  -- T28 ledger post
  select count(*) into v_ledger
  from public.professional_payout_ledger_entries
  where payout_id = v_payout and effect = 'post';
  perform pg_temp.record('T28', 'ledger', 'post on settle', 'samara', true, v_ledger = 2);

  -- T21 amount locked
  begin
    perform public.update_pregnancy_procedure_payout_amount(v_payout, 1);
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  perform pg_temp.record('T21', 'repasse', 'update amount after settle', 'samara', false, v_ok);

  -- T22 cancel settled
  begin
    perform public.cancel_pregnancy_procedure_payout(v_payout, 'TESTE B2 cancelamento');
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  perform pg_temp.record('T22', 'repasse', 'cancel settled', 'samara', true, v_ok);

  -- T23 history remains
  select count(*) into v_events from public.pregnancy_procedure_payout_events where payout_id = v_payout;
  perform pg_temp.record('T23', 'historico', 'events remain', 'db', true, v_events >= 3);

  -- T29 reverse
  select count(*) into v_ledger
  from public.professional_payout_ledger_entries
  where payout_id = v_payout and effect = 'reverse';
  perform pg_temp.record('T29', 'ledger', 'reverse on cancel', 'samara', true, v_ledger = 2);

  -- T24 new after cancel
  begin
    v_payout2 := public.create_pregnancy_procedure_payout(v_proc_backup, 180000, 'TESTE B2 novo apos cancel', null);
  exception when others then
    v_payout2 := null;
  end;
  perform pg_temp.record('T24', 'repasse', 'create after cancel', 'samara', true, v_payout2 is not null);

  -- T25 second active blocked
  begin
    v_ok := public.create_pregnancy_procedure_payout(v_proc_backup, 100, 'dup', null) is not null;
  exception when others then
    v_ok := false;
  end;
  perform pg_temp.record('T25', 'repasse', 'second active', 'samara', false, v_ok);

  -- T30 history on new
  select count(*) into v_events from public.pregnancy_procedure_payout_events where payout_id = v_payout2;
  perform pg_temp.record('T30', 'historico', 'created event', 'db', true, v_events >= 1);

  -- T31 revoke grant preserves
  begin
    perform public.revoke_pregnancy_backup_access(v_pregnancy);
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  select status into v_status from public.pregnancy_procedure_payouts where id = v_payout;
  select count(*) into v_n from public.pregnancy_procedures where id = v_proc_backup;
  perform pg_temp.record(
    'T31', 'grant', 'revoke preserves history', 'samara', true,
    v_ok and v_status = 'cancelled' and v_n = 1 and v_payout2 is not null
  );

  -- T32 sem auth (uid nulo)
  perform pg_temp.clear_auth();
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  select public.can_read_pregnancy_procedure_payout(v_house, v_prof_samara, v_prof_thais) into v_ok;
  perform pg_temp.record('T32', 'api', 'acl sem auth', 'anon', false, coalesce(v_ok, false));

  -- T33 direct insert as terceira
  if v_uid_third is not null then
    perform pg_temp.impersonate(v_uid_third);
    begin
      insert into public.pregnancy_procedure_payouts (
        organization_id, practice_id, pregnancy_id, pregnancy_procedure_id,
        principal_professional_id, backup_professional_id, amount_cents, created_by
      ) values (
        v_org, v_house, v_pregnancy, v_proc_backup,
        v_prof_samara, v_prof_thais, 1, v_uid_third
      );
      v_ok := true;
    exception when others then
      v_ok := false;
    end;
    perform pg_temp.record('T33', 'rls', 'direct insert', 'terceira', false, v_ok);
  else
    perform pg_temp.record_text('T33', 'rls', 'direct insert', 'terceira', 'negado', 'NÃO EXECUTADO — sem terceira');
  end if;

  -- T35 regressão A
  perform pg_temp.impersonate(v_uid_thais);
  select public.can_access_pregnancy(v_pregnancy, v_house, v_patient, v_prof_samara) into v_ok;
  perform pg_temp.record('T35a', 'regressao A', 'backup sem grant', 'thais', false, v_ok);

  perform pg_temp.impersonate(v_uid_samara);
  select public.can_access_pregnancy(v_pregnancy, v_house, v_patient, v_prof_samara) into v_ok;
  perform pg_temp.record('T35b', 'regressao A', 'principal acesso', 'samara', true, v_ok);

  -- T36 regressão B1
  perform pg_temp.record_text(
    'T36a', 'regressao B1', 'can_read_professional_policy', 'db', 'exists',
    case when to_regprocedure('public.can_read_professional_policy(uuid, uuid)') is not null then 'exists' else 'missing' end
  );
  perform pg_temp.record_text(
    'T36b', 'regressao B1', 'publish rpc', 'db', 'exists',
    case when to_regprocedure(
      'public.publish_professional_care_policy_version(uuid, uuid, integer, integer, boolean, boolean, date)'
    ) is not null then 'exists' else 'missing' end
  );
  select can_view_care_policies into v_ok
  from public.user_practice_roles
  where user_id = v_uid_secretary and practice_id = v_house
  limit 1;
  perform pg_temp.record('T36c', 'regressao B1', 'flag secretaria false apos teste', 'secretaria', true, v_ok is not distinct from false);

  -- metadata for report
  perform pg_temp.record_text('META_PATIENT', 'dados', 'patient_id', 'teste', v_patient::text, v_patient::text);
  perform pg_temp.record_text('META_PREG', 'dados', 'pregnancy_id', 'teste', v_pregnancy::text, v_pregnancy::text);
  perform pg_temp.record_text('META_PROC_P', 'dados', 'proc_principal', 'teste', coalesce(v_proc_principal::text,'null'), coalesce(v_proc_principal::text,'null'));
  perform pg_temp.record_text('META_PROC_B', 'dados', 'proc_backup', 'teste', coalesce(v_proc_backup::text,'null'), coalesce(v_proc_backup::text,'null'));
  perform pg_temp.record_text('META_PAY1', 'dados', 'payout_cancelled', 'teste', coalesce(v_payout::text,'null'), coalesce(v_payout::text,'null'));
  perform pg_temp.record_text('META_PAY2', 'dados', 'payout_active', 'teste', coalesce(v_payout2::text,'null'), coalesce(v_payout2::text,'null'));

  perform pg_temp.clear_auth();
end;
$audit$;

select test_id, secao, operacao, usuario, esperado, obtido,
       case when pass then 'PASSOU' else 'FALHOU' end as resultado
from b2_audit_results
where test_id not like 'META_%'
order by seq;

select
  count(*) filter (where pass and test_id not like 'META_%') as passou,
  count(*) filter (where not pass and test_id not like 'META_%') as falhou,
  count(*) filter (where obtido like 'NÃO EXECUTADO%' and test_id not like 'META_%') as nao_exec,
  count(*) filter (where test_id not like 'META_%') as total
from b2_audit_results;

select test_id, obtido as uuid_ou_valor
from b2_audit_results
where test_id like 'META_%'
order by test_id;
