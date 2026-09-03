-- =============================================================================
-- Testes Fase B2 — procedimentos de gestação + repasse à retaguarda
-- SOMENTE PostgreSQL LOCAL (Supabase local / Docker).
-- =============================================================================
-- NÃO usar em projeto remoto.
-- NÃO executar supabase db push.
-- NÃO altera migrations 0001–0014 nem dados reais.
--
-- Pré-requisito: migration 0015 aplicada no banco LOCAL.
--
--   npx supabase db query --local -f supabase/tests/pregnancy_procedures_payouts.sql
--
-- Tudo corre numa transação. ROLLBACK final descarta os dados fictícios.
-- =============================================================================

begin;

do $$
declare
  v_addr inet;
begin
  v_addr := inet_server_addr();

  if v_addr is not null
     and v_addr not in ('127.0.0.1'::inet, '::1'::inet)
     and not (v_addr << '10.0.0.0/8'::cidr)
     and not (v_addr << '172.16.0.0/12'::cidr)
     and not (v_addr << '192.168.0.0/16'::cidr)
  then
    raise exception
      'Recusado: inet_server_addr=% não parece PostgreSQL local. Este script não pode correr no remoto.',
      v_addr;
  end if;

  if to_regprocedure('public.create_pregnancy_procedure(uuid, text, uuid, date, text)') is null
     or to_regprocedure('public.create_pregnancy_procedure_payout(uuid, integer, text, date)') is null
     or to_regprocedure('public.settle_pregnancy_procedure_payout(uuid, date)') is null then
    raise exception 'Migration 0015 não aplicada neste banco.';
  end if;
end;
$$;

create temporary table b2_results (
  seq integer generated always as identity,
  test_id text primary key,
  secao text not null,
  operacao text not null,
  usuario text not null,
  esperado text not null,
  obtido text not null,
  pass boolean not null
) on commit drop;

revoke all on table pg_temp.b2_results from public;
revoke all on table pg_temp.b2_results from authenticated;

create or replace function pg_temp.record(
  p_id text,
  p_secao text,
  p_op text,
  p_user text,
  p_esperado boolean,
  p_obtido boolean
) returns void
language plpgsql
security definer
set search_path = pg_temp, pg_catalog
as $$
begin
  insert into pg_temp.b2_results (test_id, secao, operacao, usuario, esperado, obtido, pass)
  values (
    p_id, p_secao, p_op, p_user,
    case when p_esperado then 'permitido' else 'negado' end,
    case when p_obtido then 'permitido' else 'negado' end,
    p_esperado is not distinct from p_obtido
  );
end;
$$;

create or replace function pg_temp.record_text(
  p_id text,
  p_secao text,
  p_op text,
  p_user text,
  p_esperado text,
  p_obtido text
) returns void
language plpgsql
security definer
set search_path = pg_temp, pg_catalog
as $$
begin
  insert into pg_temp.b2_results (test_id, secao, operacao, usuario, esperado, obtido, pass)
  values (
    p_id, p_secao, p_op, p_user, p_esperado, p_obtido,
    p_esperado is not distinct from p_obtido
  );
end;
$$;

create or replace function pg_temp.make_auth_user(p_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = auth, public, extensions
as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    p_id, 'authenticated', 'authenticated', p_email,
    crypt('test-local-only', gen_salt('bf')), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    '{}'::jsonb, now(), now(), '', '', '', ''
  );
  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    p_id::text, p_id,
    jsonb_build_object('sub', p_id::text, 'email', p_email),
    'email', now(), now(), now()
  );
end;
$$;

create or replace function pg_temp.impersonate(p_uid uuid)
returns void
language plpgsql
as $$
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

create or replace function pg_temp.clear_auth()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Dados fictícios B2
-- ---------------------------------------------------------------------------

do $seed$
declare
  v_org uuid := 'b2b2b2b2-0002-0002-0002-000000000001';
  v_house uuid := 'b2b2b2b2-0002-0002-0002-000000000010';
  v_other uuid := 'b2b2b2b2-0002-0002-0002-000000000011';
  v_uid_principal uuid := 'b2b2b2b2-0002-0002-0002-000000000101';
  v_uid_backup uuid := 'b2b2b2b2-0002-0002-0002-000000000102';
  v_uid_third uuid := 'b2b2b2b2-0002-0002-0002-000000000103';
  v_uid_secretary uuid := 'b2b2b2b2-0002-0002-0002-000000000104';
  v_uid_secretary_flag uuid := 'b2b2b2b2-0002-0002-0002-000000000105';
  v_uid_owner uuid := 'b2b2b2b2-0002-0002-0002-000000000106';
  v_uid_admin uuid := 'b2b2b2b2-0002-0002-0002-000000000107';
  v_uid_patient uuid := 'b2b2b2b2-0002-0002-0002-000000000108';
  v_uid_other_prac uuid := 'b2b2b2b2-0002-0002-0002-000000000109';
  v_prof_principal uuid := 'b2b2b2b2-0002-0002-0002-000000000201';
  v_prof_backup uuid := 'b2b2b2b2-0002-0002-0002-000000000202';
  v_prof_third uuid := 'b2b2b2b2-0002-0002-0002-000000000203';
  v_prof_other uuid := 'b2b2b2b2-0002-0002-0002-000000000204';
  v_patient uuid := 'b2b2b2b2-0002-0002-0002-000000000301';
  v_pregnancy uuid := 'b2b2b2b2-0002-0002-0002-000000000401';
begin
  insert into public.organizations (id, legal_name, trade_name, cnpj)
  values (v_org, 'TESTE B2 ORG LTDA', 'TESTE B2 ORG', '22000000000191');

  insert into public.practice_units (
    id, organization_id, kind, code, name, specialty, isolation_label
  ) values
    (v_house, v_org, 'house', 'B2-HOUSE', 'TESTE B2 House', 'obstetrics', 'TESTE B2 House'),
    (v_other, v_org, 'sublet', 'B2-OTHER', 'TESTE B2 Other', 'gynecology', 'TESTE B2 Other');

  perform pg_temp.make_auth_user(v_uid_principal, 'teste.b2.principal@exemplo.local');
  perform pg_temp.make_auth_user(v_uid_backup, 'teste.b2.backup@exemplo.local');
  perform pg_temp.make_auth_user(v_uid_third, 'teste.b2.terceira@exemplo.local');
  perform pg_temp.make_auth_user(v_uid_secretary, 'teste.b2.secretaria@exemplo.local');
  perform pg_temp.make_auth_user(v_uid_secretary_flag, 'teste.b2.secretaria.flag@exemplo.local');
  perform pg_temp.make_auth_user(v_uid_owner, 'teste.b2.owner@exemplo.local');
  perform pg_temp.make_auth_user(v_uid_admin, 'teste.b2.admin@exemplo.local');
  perform pg_temp.make_auth_user(v_uid_patient, 'teste.b2.paciente@exemplo.local');
  perform pg_temp.make_auth_user(v_uid_other_prac, 'teste.b2.outra.pratica@exemplo.local');

  insert into public.profiles (id, organization_id, full_name, email)
  values
    (v_uid_principal, v_org, 'TESTE B2 Principal', 'teste.b2.principal@exemplo.local'),
    (v_uid_backup, v_org, 'TESTE B2 Retaguarda', 'teste.b2.backup@exemplo.local'),
    (v_uid_third, v_org, 'TESTE B2 Terceira', 'teste.b2.terceira@exemplo.local'),
    (v_uid_secretary, v_org, 'TESTE B2 Secretaria', 'teste.b2.secretaria@exemplo.local'),
    (v_uid_secretary_flag, v_org, 'TESTE B2 Secretaria Flag', 'teste.b2.secretaria.flag@exemplo.local'),
    (v_uid_owner, v_org, 'TESTE B2 Owner', 'teste.b2.owner@exemplo.local'),
    (v_uid_admin, v_org, 'TESTE B2 Admin', 'teste.b2.admin@exemplo.local'),
    (v_uid_patient, v_org, 'TESTE B2 Paciente', 'teste.b2.paciente@exemplo.local'),
    (v_uid_other_prac, v_org, 'TESTE B2 Outra Pratica', 'teste.b2.outra.pratica@exemplo.local');

  insert into public.professionals (
    id, organization_id, practice_id, profile_id, council_type, council_number
  ) values
    (v_prof_principal, v_org, v_house, v_uid_principal, 'CRM', '92001'),
    (v_prof_backup, v_org, v_house, v_uid_backup, 'CRM', '92002'),
    (v_prof_third, v_org, v_house, v_uid_third, 'CRM', '92003'),
    (v_prof_other, v_org, v_other, v_uid_other_prac, 'CRM', '92004');

  insert into public.user_practice_roles (
    user_id, practice_id, role, clinical_access, can_view_care_policies
  ) values
    (v_uid_principal, v_house, 'physician', 'own_encounters', false),
    (v_uid_backup, v_house, 'physician', 'own_encounters', false),
    (v_uid_third, v_house, 'physician', 'own_encounters', false),
    (v_uid_secretary, v_house, 'secretary', 'none', false),
    (v_uid_secretary_flag, v_house, 'secretary', 'none', true),
    (v_uid_owner, v_house, 'owner', 'practice', false),
    (v_uid_admin, v_house, 'admin', 'practice', false),
    (v_uid_other_prac, v_other, 'physician', 'own_encounters', false);

  insert into public.patients (id, organization_id, full_name, created_by)
  values (v_patient, v_org, 'TESTE B2 — PACIENTE REPASSE 001', v_uid_owner);

  insert into public.patient_practice_links (patient_id, practice_id)
  values (v_patient, v_house);

  insert into public.pregnancies (
    id, organization_id, practice_id, patient_id,
    primary_professional_id, backup_professional_id,
    status, lmp_date, created_by
  ) values (
    v_pregnancy, v_org, v_house, v_patient,
    v_prof_principal, v_prof_backup,
    'in_care', current_date - 100, v_uid_principal
  );

  insert into public.pregnancy_backup_grants (
    pregnancy_id, organization_id, practice_id, patient_id,
    principal_professional_id, backup_professional_id, granted_by
  ) values (
    v_pregnancy, v_org, v_house, v_patient,
    v_prof_principal, v_prof_backup, v_uid_principal
  );

  insert into public.procedures (organization_id, practice_id, code, name, duration_min, is_shared)
  values (v_org, null, 'OBSTETRIC_BIRTH', 'Parto obstétrico', 60, true)
  on conflict (organization_id, code) do nothing;
end;
$seed$;

set local role authenticated;

-- Helpers de tentativa
create or replace function pg_temp.try_create_procedure(
  p_pregnancy uuid,
  p_code text,
  p_performed_by uuid,
  p_at date,
  p_notes text default null
) returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  v_id := public.create_pregnancy_procedure(p_pregnancy, p_code, p_performed_by, p_at, p_notes);
  return v_id;
exception
  when others then
    return null;
end;
$$;

create or replace function pg_temp.try_create_payout(
  p_procedure uuid,
  p_amount integer,
  p_notes text default null
) returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  v_id := public.create_pregnancy_procedure_payout(p_procedure, p_amount, p_notes, null);
  return v_id;
exception
  when others then
    return null;
end;
$$;

create or replace function pg_temp.try_update_notes(p_payout uuid, p_notes text)
returns boolean
language plpgsql
as $$
begin
  perform public.update_pregnancy_procedure_payout_notes(p_payout, p_notes);
  return true;
exception
  when others then
    return false;
end;
$$;

create or replace function pg_temp.try_update_amount(p_payout uuid, p_amount integer)
returns boolean
language plpgsql
as $$
begin
  perform public.update_pregnancy_procedure_payout_amount(p_payout, p_amount);
  return true;
exception
  when others then
    return false;
end;
$$;

create or replace function pg_temp.try_settle(p_payout uuid, p_on date)
returns boolean
language plpgsql
as $$
begin
  perform public.settle_pregnancy_procedure_payout(p_payout, p_on);
  return true;
exception
  when others then
    return false;
end;
$$;

create or replace function pg_temp.try_cancel(p_payout uuid, p_reason text)
returns boolean
language plpgsql
as $$
begin
  perform public.cancel_pregnancy_procedure_payout(p_payout, p_reason);
  return true;
exception
  when others then
    return false;
end;
$$;

create or replace function pg_temp.count_payout_select(p_payout uuid)
returns integer
language plpgsql
as $$
declare
  v_n integer;
begin
  select count(*) into v_n
  from public.pregnancy_procedure_payouts
  where id = p_payout;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cenário principal
-- ---------------------------------------------------------------------------

do $tests$
declare
  v_uid_principal uuid := 'b2b2b2b2-0002-0002-0002-000000000101';
  v_uid_backup uuid := 'b2b2b2b2-0002-0002-0002-000000000102';
  v_uid_third uuid := 'b2b2b2b2-0002-0002-0002-000000000103';
  v_uid_secretary uuid := 'b2b2b2b2-0002-0002-0002-000000000104';
  v_uid_secretary_flag uuid := 'b2b2b2b2-0002-0002-0002-000000000105';
  v_uid_owner uuid := 'b2b2b2b2-0002-0002-0002-000000000106';
  v_uid_admin uuid := 'b2b2b2b2-0002-0002-0002-000000000107';
  v_uid_patient uuid := 'b2b2b2b2-0002-0002-0002-000000000108';
  v_uid_other_prac uuid := 'b2b2b2b2-0002-0002-0002-000000000109';
  v_prof_principal uuid := 'b2b2b2b2-0002-0002-0002-000000000201';
  v_prof_backup uuid := 'b2b2b2b2-0002-0002-0002-000000000202';
  v_pregnancy uuid := 'b2b2b2b2-0002-0002-0002-000000000401';
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
begin
  -- T01 principal cria procedimento próprio
  perform pg_temp.impersonate(v_uid_principal);
  v_proc_principal := pg_temp.try_create_procedure(
    v_pregnancy, 'OBSTETRIC_BIRTH', v_prof_principal, current_date, 'TESTE B2 proc principal'
  );
  perform pg_temp.record('T01', 'procedimento', 'create self', 'principal', true, v_proc_principal is not null);

  -- T02 principal cria procedimento da retaguarda
  v_proc_backup := pg_temp.try_create_procedure(
    v_pregnancy, 'OBSTETRIC_BIRTH', v_prof_backup, current_date, 'TESTE B2 proc retaguarda'
  );
  perform pg_temp.record('T02', 'procedimento', 'create backup', 'principal', true, v_proc_backup is not null);

  -- T19 procedimento da principal NÃO recebe repasse
  v_payout := pg_temp.try_create_payout(v_proc_principal, 250000, 'não deveria');
  perform pg_temp.record('T19', 'repasse', 'payout on principal proc', 'principal', false, v_payout is not null);

  -- T03 principal cria repasse
  v_payout := pg_temp.try_create_payout(v_proc_backup, 250000, 'TESTE B2 repasse 2500');
  perform pg_temp.record('T03', 'repasse', 'create payout', 'principal', true, v_payout is not null);

  -- T26 valor em centavos
  select amount_cents into v_amount from public.pregnancy_procedure_payouts where id = v_payout;
  perform pg_temp.record_text('T26', 'valor', 'amount_cents', 'db', '250000', coalesce(v_amount::text, 'null'));

  -- T04 principal visualiza
  v_n := pg_temp.count_payout_select(v_payout);
  perform pg_temp.record('T04', 'repasse', 'select', 'principal', true, v_n = 1);

  -- T05 retaguarda visualiza
  perform pg_temp.impersonate(v_uid_backup);
  v_n := pg_temp.count_payout_select(v_payout);
  perform pg_temp.record('T05', 'repasse', 'select', 'backup', true, v_n = 1);

  -- T06 retaguarda altera observação
  v_ok := pg_temp.try_update_notes(v_payout, 'obs retaguarda ok');
  perform pg_temp.record('T06', 'repasse', 'update notes', 'backup', true, v_ok);

  -- T07 retaguarda tenta alterar valor
  v_ok := pg_temp.try_update_amount(v_payout, 1);
  perform pg_temp.record('T07', 'repasse', 'update amount', 'backup', false, v_ok);

  -- T08 retaguarda tenta alterar status (settle)
  v_ok := pg_temp.try_settle(v_payout, current_date);
  perform pg_temp.record('T08', 'repasse', 'settle', 'backup', false, v_ok);

  -- T09 retaguarda tenta criar repasse
  v_payout2 := pg_temp.try_create_payout(v_proc_backup, 100, 'backup cria');
  perform pg_temp.record('T09', 'repasse', 'create payout', 'backup', false, v_payout2 is not null);

  -- T10 terceira médica
  perform pg_temp.impersonate(v_uid_third);
  v_n := pg_temp.count_payout_select(v_payout);
  perform pg_temp.record('T10', 'repasse', 'select', 'terceira', false, v_n > 0);

  -- T11 secretária sem flag
  perform pg_temp.impersonate(v_uid_secretary);
  v_n := pg_temp.count_payout_select(v_payout);
  perform pg_temp.record('T11', 'repasse', 'select', 'secretaria', false, v_n > 0);

  -- T12 / T34 secretária com can_view_care_policies
  perform pg_temp.impersonate(v_uid_secretary_flag);
  v_n := pg_temp.count_payout_select(v_payout);
  perform pg_temp.record('T12', 'repasse', 'select', 'secretaria+flag B1', false, v_n > 0);
  perform pg_temp.record('T34', 'seguranca', 'flag B1 nao libera payout', 'secretaria+flag', false, v_n > 0);

  -- T13 owner visualiza
  perform pg_temp.impersonate(v_uid_owner);
  v_n := pg_temp.count_payout_select(v_payout);
  perform pg_temp.record('T13', 'repasse', 'select', 'owner', true, v_n = 1);

  -- T14 owner tenta editar
  v_ok := pg_temp.try_update_amount(v_payout, 999);
  perform pg_temp.record('T14', 'repasse', 'update amount', 'owner', false, v_ok);

  -- T15 admin visualiza
  perform pg_temp.impersonate(v_uid_admin);
  v_n := pg_temp.count_payout_select(v_payout);
  perform pg_temp.record('T15', 'repasse', 'select', 'admin', true, v_n = 1);

  -- T16 admin tenta editar
  v_ok := pg_temp.try_settle(v_payout, current_date);
  perform pg_temp.record('T16', 'repasse', 'settle', 'admin', false, v_ok);

  -- T17 paciente
  perform pg_temp.impersonate(v_uid_patient);
  v_n := pg_temp.count_payout_select(v_payout);
  perform pg_temp.record('T17', 'repasse', 'select', 'paciente', false, v_n > 0);

  -- T18 outra prática
  perform pg_temp.impersonate(v_uid_other_prac);
  v_n := pg_temp.count_payout_select(v_payout);
  perform pg_temp.record('T18', 'repasse', 'select', 'outra pratica', false, v_n > 0);

  -- T27 pendente sem ledger
  perform pg_temp.impersonate(v_uid_principal);
  select count(*) into v_ledger
  from public.professional_payout_ledger_entries
  where payout_id = v_payout;
  perform pg_temp.record('T27', 'ledger', 'pending no post', 'principal', true, v_ledger = 0);

  -- T20 efetivar
  v_ok := pg_temp.try_settle(v_payout, current_date);
  perform pg_temp.record('T20', 'repasse', 'settle', 'principal', true, v_ok);

  -- T28 ledger após settle
  select count(*) into v_ledger
  from public.professional_payout_ledger_entries
  where payout_id = v_payout and effect = 'post';
  perform pg_temp.record('T28', 'ledger', 'post on settle', 'principal', true, v_ledger = 2);

  -- T21 valor bloqueado após efetivado
  v_ok := pg_temp.try_update_amount(v_payout, 1);
  perform pg_temp.record('T21', 'repasse', 'update amount after settle', 'principal', false, v_ok);

  -- T22 cancelar efetivado
  v_ok := pg_temp.try_cancel(v_payout, 'TESTE B2 cancelamento');
  perform pg_temp.record('T22', 'repasse', 'cancel settled', 'principal', true, v_ok);

  -- T23 histórico permanece
  select count(*) into v_events
  from public.pregnancy_procedure_payout_events
  where payout_id = v_payout;
  perform pg_temp.record('T23', 'historico', 'events remain', 'db', true, v_events >= 3);

  -- T29 estorno no ledger
  select count(*) into v_ledger
  from public.professional_payout_ledger_entries
  where payout_id = v_payout and effect = 'reverse';
  perform pg_temp.record('T29', 'ledger', 'reverse on cancel', 'principal', true, v_ledger = 2);

  -- T24 novo repasse após cancelamento
  v_payout2 := pg_temp.try_create_payout(v_proc_backup, 180000, 'TESTE B2 novo apos cancel');
  perform pg_temp.record('T24', 'repasse', 'create after cancel', 'principal', true, v_payout2 is not null);

  -- T25 dois ativos bloqueados
  v_ok := pg_temp.try_create_payout(v_proc_backup, 100, 'duplicado') is not null;
  perform pg_temp.record('T25', 'repasse', 'second active', 'principal', false, v_ok);

  -- T30 alterações no histórico (amount update path already + cancel/settle)
  select count(*) into v_events
  from public.pregnancy_procedure_payout_events
  where payout_id = v_payout2;
  perform pg_temp.record('T30', 'historico', 'created event', 'db', true, v_events >= 1);

  -- T31 revogação do grant não apaga
  perform public.revoke_pregnancy_backup_access(v_pregnancy);
  select status into v_status from public.pregnancy_procedure_payouts where id = v_payout;
  select count(*) into v_n from public.pregnancy_procedures where id = v_proc_backup;
  perform pg_temp.record(
    'T31',
    'grant',
    'revoke preserves history',
    'principal',
    true,
    v_status = 'cancelled' and v_n = 1 and v_payout2 is not null
  );

  -- T32 acesso direto sem auth
  perform pg_temp.clear_auth();
  v_n := pg_temp.count_payout_select(v_payout);
  perform pg_temp.record('T32', 'api', 'select sem auth', 'anon', false, v_n > 0);

  -- T33 RLS direta (terceira já coberta; reforço insert direto)
  perform pg_temp.impersonate(v_uid_third);
  begin
    insert into public.pregnancy_procedure_payouts (
      organization_id, practice_id, pregnancy_id, pregnancy_procedure_id,
      principal_professional_id, backup_professional_id, amount_cents, created_by
    )
    select organization_id, practice_id, pregnancy_id, id,
           'b2b2b2b2-0002-0002-0002-000000000201',
           'b2b2b2b2-0002-0002-0002-000000000202',
           1, v_uid_third
    from public.pregnancy_procedures
    where id = v_proc_backup;
    v_ok := true;
  exception
    when others then
      v_ok := false;
  end;
  perform pg_temp.record('T33', 'rls', 'direct insert', 'terceira', false, v_ok);

  -- T35 regressão Fase A — grant revogado, acesso backup some; gestação principal ok
  perform pg_temp.impersonate(v_uid_backup);
  select public.can_access_pregnancy(
    v_pregnancy,
    'b2b2b2b2-0002-0002-0002-000000000010',
    'b2b2b2b2-0002-0002-0002-000000000301',
    v_prof_principal
  ) into v_ok;
  perform pg_temp.record('T35a', 'regressao A', 'backup sem grant', 'backup', false, v_ok);

  perform pg_temp.impersonate(v_uid_principal);
  select public.can_access_pregnancy(
    v_pregnancy,
    'b2b2b2b2-0002-0002-0002-000000000010',
    'b2b2b2b2-0002-0002-0002-000000000301',
    v_prof_principal
  ) into v_ok;
  perform pg_temp.record('T35b', 'regressao A', 'principal acesso', 'principal', true, v_ok);

  -- T36 regressão B1 — flag e helpers intactos
  perform pg_temp.record_text(
    'T36a',
    'regressao B1',
    'can_read_professional_policy exists',
    'db',
    'exists',
    case when to_regprocedure('public.can_read_professional_policy(uuid, uuid)') is not null
      then 'exists' else 'missing' end
  );
  perform pg_temp.record_text(
    'T36b',
    'regressao B1',
    'publish rpc exists',
    'db',
    'exists',
    case when to_regprocedure(
      'public.publish_professional_care_policy_version(uuid, uuid, integer, integer, boolean, boolean, date)'
    ) is not null then 'exists' else 'missing' end
  );
  select can_view_care_policies into v_ok
  from public.user_practice_roles
  where user_id = v_uid_secretary_flag
  limit 1;
  perform pg_temp.record('T36c', 'regressao B1', 'flag permanece true', 'secretaria+flag', true, v_ok);
end;
$tests$;

select
  test_id,
  secao,
  operacao,
  usuario,
  esperado,
  obtido,
  case when pass then 'PASS' else 'FAIL' end as resultado
from pg_temp.b2_results
order by seq;

select
  count(*) filter (where pass) as passou,
  count(*) filter (where not pass) as falhou,
  count(*) as total
from pg_temp.b2_results;

rollback;
