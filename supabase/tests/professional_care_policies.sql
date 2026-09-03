-- =============================================================================
-- Testes Fase B1 — política de atendimento versionada
-- SOMENTE PostgreSQL LOCAL (Supabase local / Docker).
-- =============================================================================
-- NÃO usar em projeto remoto.
-- NÃO executar supabase db push.
-- NÃO altera migrations 0001–0012 nem dados reais.
--
-- Como rodar (stack local no ar, 0013 aplicada):
--
--   npx supabase db query --local -f supabase/tests/professional_care_policies.sql
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

  if to_regprocedure('public.publish_professional_care_policy_version(uuid, uuid, integer, integer, boolean, boolean, date)') is null
     or to_regprocedure('public.can_manage_professional_policy(uuid, uuid)') is null then
    raise exception 'Migration 0013 não aplicada neste banco.';
  end if;
end;
$$;

create temporary table b1_results (
  seq integer generated always as identity,
  test_id text primary key,
  secao text not null,
  operacao text not null,
  usuario text not null,
  esperado text not null,
  obtido text not null,
  pass boolean not null
) on commit drop;

revoke all on table pg_temp.b1_results from public;
revoke all on table pg_temp.b1_results from authenticated;

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
  insert into pg_temp.b1_results (test_id, secao, operacao, usuario, esperado, obtido, pass)
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
  insert into pg_temp.b1_results (test_id, secao, operacao, usuario, esperado, obtido, pass)
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

create or replace function pg_temp.try_publish(
  p_professional uuid,
  p_practice uuid,
  p_normal integer,
  p_cesarean integer,
  p_requires boolean,
  p_allows boolean,
  p_from date
) returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  v_id := public.publish_professional_care_policy_version(
    p_professional, p_practice, p_normal, p_cesarean, p_requires, p_allows, p_from
  );
  return v_id;
exception
  when others then
    return null;
end;
$$;

create or replace function pg_temp.current_policy_count()
returns integer
language plpgsql
as $$
declare
  v_n integer;
begin
  select count(*) into v_n from public.professional_care_policy_current;
  return v_n;
end;
$$;

create or replace function pg_temp.try_insert_policy_version()
returns boolean
language plpgsql
as $$
begin
  insert into public.professional_care_policy_versions (
    policy_id, professional_id, practice_id, organization_id, version_number,
    normal_birth_cents, cesarean_cents, requires_availability_for_prenatal,
    allows_prenatal_exception, effective_from
  )
  select
    policy_id, professional_id, practice_id, organization_id, 50,
    1, 1, false, false, current_date
  from public.professional_care_policy_current
  limit 1;
  return true;
exception
  when others then
    return false;
end;
$$;

create or replace function pg_temp.try_update_policy_version()
returns boolean
language plpgsql
as $$
begin
  update public.professional_care_policy_versions
     set normal_birth_cents = 1
   where effective_to is null;
  return found;
exception
  when others then
    return false;
end;
$$;

create or replace function pg_temp.try_delete_policy_version()
returns boolean
language plpgsql
as $$
begin
  delete from public.professional_care_policy_versions
   where effective_to is null;
  return found;
exception
  when others then
    return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dados fictícios (não são Samara/Thais reais; simulam duas médicas da house)
-- ---------------------------------------------------------------------------

do $seed$
declare
  v_org uuid := 'b1b1b1b1-0001-0001-0001-000000000001';
  v_house uuid := 'b1b1b1b1-0001-0001-0001-000000000010';
  v_sublet uuid := 'b1b1b1b1-0001-0001-0001-000000000011';
  v_uid_a uuid := 'b1b1b1b1-0001-0001-0001-000000000101';
  v_uid_b uuid := 'b1b1b1b1-0001-0001-0001-000000000102';
  v_uid_c uuid := 'b1b1b1b1-0001-0001-0001-000000000103';
  v_uid_tenant uuid := 'b1b1b1b1-0001-0001-0001-000000000104';
  v_uid_secretary uuid := 'b1b1b1b1-0001-0001-0001-000000000105';
  v_uid_secretary_b uuid := 'b1b1b1b1-0001-0001-0001-000000000108';
  v_uid_owner uuid := 'b1b1b1b1-0001-0001-0001-000000000106';
  v_uid_sa uuid := 'b1b1b1b1-0001-0001-0001-000000000107';
  v_uid_admin uuid := 'b1b1b1b1-0001-0001-0001-000000000109';
  v_prof_a uuid := 'b1b1b1b1-0001-0001-0001-000000000201';
  v_prof_b uuid := 'b1b1b1b1-0001-0001-0001-000000000202';
  v_prof_c uuid := 'b1b1b1b1-0001-0001-0001-000000000203';
  v_prof_tenant uuid := 'b1b1b1b1-0001-0001-0001-000000000204';
begin
  perform pg_temp.make_auth_user(v_uid_a, 'medica.a.b1@local.test');
  perform pg_temp.make_auth_user(v_uid_b, 'medica.b.b1@local.test');
  perform pg_temp.make_auth_user(v_uid_c, 'medico.c.b1@local.test');
  perform pg_temp.make_auth_user(v_uid_tenant, 'locatario.b1@local.test');
  perform pg_temp.make_auth_user(v_uid_secretary, 'secretaria.b1@local.test');
  perform pg_temp.make_auth_user(v_uid_secretary_b, 'secretaria.b.b1@local.test');
  perform pg_temp.make_auth_user(v_uid_owner, 'owner.b1@local.test');
  perform pg_temp.make_auth_user(v_uid_sa, 'sysadmin.b1@local.test');
  perform pg_temp.make_auth_user(v_uid_admin, 'admin.b1@local.test');

  insert into public.organizations (id, legal_name, trade_name, cnpj)
  values (v_org, 'B1 Políticas Ltda', 'B1 Políticas', '44555666000177');

  insert into public.practice_units (
    id, organization_id, kind, code, name, specialty, isolation_label
  ) values
    (v_house, v_org, 'house', 'B1HOUSE', 'Casa B1', 'GO', 'b1-casa'),
    (v_sublet, v_org, 'sublet', 'B1SUB', 'Locada B1', 'GO', 'b1-locatario');

  insert into public.profiles (id, organization_id, full_name, email) values
    (v_uid_a, v_org, 'Médica A (Samara-like)', 'medica.a.b1@local.test'),
    (v_uid_b, v_org, 'Médica B (Thais-like)', 'medica.b.b1@local.test'),
    (v_uid_c, v_org, 'Médico C', 'medico.c.b1@local.test'),
    (v_uid_tenant, v_org, 'Médico Locatário B1', 'locatario.b1@local.test'),
    (v_uid_secretary, v_org, 'Secretaria B1', 'secretaria.b1@local.test'),
    (v_uid_secretary_b, v_org, 'Secretaria B1 sem permissão', 'secretaria.b.b1@local.test'),
    (v_uid_owner, v_org, 'Owner B1', 'owner.b1@local.test'),
    (v_uid_sa, v_org, 'System Admin B1', 'sysadmin.b1@local.test'),
    (v_uid_admin, v_org, 'Admin B1', 'admin.b1@local.test');

  insert into public.user_practice_roles (user_id, practice_id, role, clinical_access)
  values
    (v_uid_owner, v_house, 'owner', 'none'),
    (v_uid_admin, v_house, 'admin', 'none'),
    (v_uid_a, v_house, 'physician', 'practice'),
    (v_uid_b, v_house, 'physician', 'practice'),
    (v_uid_c, v_house, 'physician', 'practice'),
    (v_uid_tenant, v_sublet, 'physician', 'own_encounters'),
    (v_uid_secretary, v_house, 'secretary', 'none'),
    (v_uid_secretary_b, v_house, 'secretary', 'none');

  insert into public.system_admins (user_id, granted_by, reason)
  values (v_uid_sa, v_uid_sa, 'bootstrap local B1');

  insert into public.professionals (
    id, profile_id, practice_id, organization_id, council_type, council_number
  ) values
    (v_prof_a, v_uid_a, v_house, v_org, 'CRM', '81001'),
    (v_prof_b, v_uid_b, v_house, v_org, 'CRM', '81002'),
    (v_prof_c, v_uid_c, v_house, v_org, 'CRM', '81003'),
    (v_prof_tenant, v_uid_tenant, v_sublet, v_org, 'CRM', '82001');
end;
$seed$;

set local role authenticated;

do $b1$
declare
  v_house uuid := 'b1b1b1b1-0001-0001-0001-000000000010';
  v_sublet uuid := 'b1b1b1b1-0001-0001-0001-000000000011';
  v_uid_a uuid := 'b1b1b1b1-0001-0001-0001-000000000101';
  v_uid_b uuid := 'b1b1b1b1-0001-0001-0001-000000000102';
  v_uid_c uuid := 'b1b1b1b1-0001-0001-0001-000000000103';
  v_uid_tenant uuid := 'b1b1b1b1-0001-0001-0001-000000000104';
  v_uid_secretary uuid := 'b1b1b1b1-0001-0001-0001-000000000105';
  v_uid_secretary_b uuid := 'b1b1b1b1-0001-0001-0001-000000000108';
  v_uid_owner uuid := 'b1b1b1b1-0001-0001-0001-000000000106';
  v_uid_sa uuid := 'b1b1b1b1-0001-0001-0001-000000000107';
  v_uid_admin uuid := 'b1b1b1b1-0001-0001-0001-000000000109';
  v_prof_a uuid := 'b1b1b1b1-0001-0001-0001-000000000201';
  v_prof_b uuid := 'b1b1b1b1-0001-0001-0001-000000000202';
  v_prof_c uuid := 'b1b1b1b1-0001-0001-0001-000000000203';
  v_prof_tenant uuid := 'b1b1b1b1-0001-0001-0001-000000000204';
  v_id uuid;
  v_id2 uuid;
  v_curr integer;
  v_n integer;
  v_old_cents integer;
  v_new_cents integer;
  v_old_to date;
  v_membership uuid;
  v_got boolean;
begin
  -- 1. Criação para médica A (Samara-like) pela própria médica
  perform pg_temp.impersonate(v_uid_a);
  v_id := pg_temp.try_publish(v_prof_a, v_house, 800000, 1000000, true, true, date '2026-09-01');
  perform pg_temp.record('T01', 'criação', 'publicar política médica A', 'physician A', true, v_id is not null);

  -- 2. Criação para médica B (Thais-like)
  perform pg_temp.impersonate(v_uid_b);
  v_id := pg_temp.try_publish(v_prof_b, v_house, 900000, 1100000, false, false, date '2026-09-01');
  perform pg_temp.record('T02', 'criação', 'publicar política médica B', 'physician B', true, v_id is not null);

  -- 3. Políticas diferentes
  perform pg_temp.impersonate(v_uid_owner);
  perform pg_temp.record(
    'T03', 'criação',
    'médica A e B com valores distintos',
    'owner',
    true,
    exists (
      select 1
      from public.professional_care_policy_current a
      join public.professional_care_policy_current b on b.professional_id = v_prof_b
      where a.professional_id = v_prof_a
        and a.normal_birth_cents is distinct from b.normal_birth_cents
        and a.requires_availability_for_prenatal is distinct from b.requires_availability_for_prenatal
    )
  );

  -- 4. Outro profissional da house
  perform pg_temp.impersonate(v_uid_c);
  v_id := pg_temp.try_publish(v_prof_c, v_house, 500000, 700000, true, false, date '2026-09-01');
  perform pg_temp.record('T04', 'criação', 'publicar política médico C', 'physician C', true, v_id is not null);

  -- 5. Prática diferente (locatário / sublet)
  perform pg_temp.impersonate(v_uid_tenant);
  v_id := pg_temp.try_publish(v_prof_tenant, v_sublet, 1200000, 1500000, true, true, date '2026-09-01');
  perform pg_temp.record('T05', 'locatário', 'política própria na prática sublet', 'physician locatário', true, v_id is not null);

  -- 6–10. Segunda versão, uma vigente, fechamento, preservação, novos valores
  perform pg_temp.impersonate(v_uid_a);
  select normal_birth_cents into v_old_cents
  from public.professional_care_policy_versions
  where professional_id = v_prof_a and effective_to is null;

  v_id2 := pg_temp.try_publish(v_prof_a, v_house, 850000, 1050000, true, true, date '2027-01-01');
  perform pg_temp.record('T06', 'versão', 'criar segunda versão mesma profissional+prática', 'physician A', true, v_id2 is not null);

  select count(*) into v_curr
  from public.professional_care_policy_versions
  where professional_id = v_prof_a and practice_id = v_house and effective_to is null;
  perform pg_temp.record('T07', 'versão', 'somente uma versão vigente', 'physician A', true, v_curr = 1);

  select effective_to into v_old_to
  from public.professional_care_policy_versions
  where professional_id = v_prof_a and version_number = 1;
  perform pg_temp.record('T08', 'versão', 'versão anterior encerrada (effective_to preenchido)', 'physician A', true, v_old_to is not null);

  select normal_birth_cents into v_n
  from public.professional_care_policy_versions
  where professional_id = v_prof_a and version_number = 1;
  perform pg_temp.record('T09', 'versão', 'valores históricos da v1 preservados', 'physician A', true, v_n = v_old_cents);

  select normal_birth_cents into v_new_cents
  from public.professional_care_policy_versions
  where professional_id = v_prof_a and effective_to is null;
  perform pg_temp.record('T10', 'versão', 'nova versão com valores diferentes', 'physician A', true, v_new_cents = 850000);

  -- 11. Duas vigentes — recusada pela RPC/trigger (valores iguais à vigente)
  v_id := pg_temp.try_publish(v_prof_a, v_house, 850000, 1050000, true, true, date '2027-02-01');
  perform pg_temp.record('T11a', 'versão', 'recusar versão duplicada idêntica à vigente', 'physician A', false, v_id is not null);

  -- 12. Profissional de outra prática
  perform pg_temp.impersonate(v_uid_a);
  v_id := pg_temp.try_publish(v_prof_a, v_sublet, 800000, 1000000, true, false, date '2026-09-01');
  perform pg_temp.record('T12', 'vínculo', 'médica A na prática locada (não pertence)', 'physician A', false, v_id is not null);

  -- 13. Owner pode gerenciar política de A
  perform pg_temp.impersonate(v_uid_owner);
  perform pg_temp.record(
    'T13', 'autorização',
    'can_manage_professional_policy(house, A)',
    'owner',
    true,
    public.can_manage_professional_policy(v_house, v_prof_a)
  );

  -- 14. SYSTEM_ADMIN sem membership não gerencia
  perform pg_temp.impersonate(v_uid_sa);
  perform pg_temp.record(
    'T14', 'autorização',
    'can_manage_professional_policy(house, A)',
    'SYSTEM_ADMIN sem membership',
    false,
    public.can_manage_professional_policy(v_house, v_prof_a)
  );

  -- 15. Secretária comum não altera
  perform pg_temp.impersonate(v_uid_secretary);
  perform pg_temp.record(
    'T15a', 'autorização',
    'can_manage_professional_policy(house, A)',
    'secretary',
    false,
    public.can_manage_professional_policy(v_house, v_prof_a)
  );
  v_id := pg_temp.try_publish(v_prof_a, v_house, 990000, 990000, false, false, date '2027-06-01');
  perform pg_temp.record('T15b', 'autorização', 'RPC publicar como secretária', 'secretary', false, v_id is not null);

  -- Médica A não gerencia política de B
  perform pg_temp.impersonate(v_uid_a);
  perform pg_temp.record(
    'T15c', 'autorização',
    'can_manage_professional_policy(house, B) pela médica A',
    'physician A',
    false,
    public.can_manage_professional_policy(v_house, v_prof_b)
  );

  perform pg_temp.impersonate(v_uid_secretary);
  perform pg_temp.record(
    'T17b', 'regressão Fase A',
    'can_create_pregnancy ainda verdadeiro para secretária da prática',
    'secretary',
    true,
    public.can_create_pregnancy(v_house)
  );

  -- Admin continua gerenciando
  perform pg_temp.impersonate(v_uid_admin);
  perform pg_temp.record(
    'T10a', 'autorização',
    'can_manage_professional_policy(house, A)',
    'admin',
    true,
    public.can_manage_professional_policy(v_house, v_prof_a)
  );

  -- Secretária sem permissão: sem SELECT
  perform pg_temp.impersonate(v_uid_secretary);
  perform pg_temp.record(
    'T20', 'secretária leitura',
    'SELECT políticas sem can_view_care_policies',
    'secretary A',
    true,
    pg_temp.current_policy_count() = 0
  );
  perform pg_temp.record(
    'T20b', 'secretária leitura',
    'can_read_professional_policy sem flag',
    'secretary A',
    false,
    public.can_read_professional_policy(v_house, v_prof_a)
  );

  -- Owner concede a A; B permanece sem
  perform pg_temp.impersonate(v_uid_owner);
  select id into v_membership
  from public.user_practice_roles
  where user_id = v_uid_secretary and practice_id = v_house and role = 'secretary';
  begin
    perform public.set_secretary_care_policy_view(v_membership, true);
    v_got := true;
  exception
    when others then
      v_got := false;
  end;
  perform pg_temp.record(
    'T21', 'secretária leitura',
    'owner concede can_view_care_policies à secretária A',
    'owner',
    true,
    v_got
  );

  perform pg_temp.impersonate(v_uid_secretary);
  perform pg_temp.record(
    'T22', 'secretária leitura',
    'SELECT políticas com permissão na prática',
    'secretary A',
    true,
    pg_temp.current_policy_count() > 0
      and public.can_read_professional_policy(v_house, v_prof_a)
  );
  perform pg_temp.record(
    'T23', 'secretária leitura',
    'permissão da house não lê política sublet',
    'secretary A',
    false,
    public.can_read_professional_policy(v_sublet, v_prof_tenant)
  );
  v_id := pg_temp.try_publish(v_prof_a, v_house, 990000, 990000, false, false, date '2027-07-01');
  perform pg_temp.record(
    'T24', 'secretária escrita',
    'publicar com permissão de leitura',
    'secretary A',
    false,
    v_id is not null
  );
  perform pg_temp.record(
    'T25a', 'secretária escrita',
    'INSERT direto de versão',
    'secretary A',
    false,
    pg_temp.try_insert_policy_version()
  );
  perform pg_temp.record(
    'T25b', 'secretária escrita',
    'UPDATE direto de versão',
    'secretary A',
    false,
    pg_temp.try_update_policy_version()
  );
  perform pg_temp.record(
    'T25c', 'secretária escrita',
    'DELETE direto de versão',
    'secretary A',
    false,
    pg_temp.try_delete_policy_version()
  );

  perform pg_temp.impersonate(v_uid_secretary_b);
  perform pg_temp.record(
    'T22b', 'secretária leitura',
    'secretária B sem flag continua sem SELECT',
    'secretary B',
    true,
    pg_temp.current_policy_count() = 0
  );

  perform pg_temp.impersonate(v_uid_secretary);
  perform pg_temp.record(
    'T26', 'isolamento clínico',
    'flag comercial não concede can_read_clinical',
    'secretary A',
    false,
    public.can_read_clinical(v_house, 'b1b1b1b1-0001-0001-0001-000000000301', v_prof_a)
  );
  perform pg_temp.record(
    'T13b', 'autorização',
    'can_manage continua falso com flag de leitura',
    'secretary A',
    false,
    public.can_manage_professional_policy(v_house, v_prof_a)
  );
end;
$b1$;

reset role;

do $schema$
declare
  v_def text;
begin
  perform pg_temp.record(
    'T16', 'regressão Fase A',
    'pregnancies sem colunas de preço/política',
    'information_schema',
    true,
    not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'pregnancies'
        and column_name in (
          'normal_birth_cents', 'cesarean_cents',
          'requires_availability_for_prenatal', 'allows_prenatal_exception',
          'policy_id', 'policy_version_id'
        )
    )
  );

  v_def := pg_get_functiondef('public.can_manage_professional_policy(uuid,uuid)'::regprocedure);
  perform pg_temp.record(
    'T17a', 'regressão Fase A',
    'can_manage_professional_policy não chama can_access_pregnancy',
    'pg_proc',
    true,
    position('can_access_pregnancy' in v_def) = 0
  );
  perform pg_temp.record(
    'T17c', 'regressão Fase A',
    'can_access_pregnancy ainda existe',
    'pg_proc',
    true,
    to_regprocedure('public.can_access_pregnancy(uuid, uuid, uuid, uuid)') is not null
  );
  v_def := pg_get_functiondef('public.can_access_pregnancy(uuid,uuid,uuid,uuid)'::regprocedure);
  perform pg_temp.record(
    'T26b', 'isolamento clínico',
    'can_access_pregnancy não referencia can_view_care_policies',
    'pg_proc',
    true,
    position('can_view_care_policies' in v_def) = 0
  );
  perform pg_temp.record(
    'T16c', 'migration',
    'coluna can_view_care_policies em user_practice_roles',
    'information_schema',
    true,
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'user_practice_roles'
        and column_name = 'can_view_care_policies'
    )
  );
  perform pg_temp.record(
    'T16b', 'regressão Fase A',
    'professionals sem colunas de preço',
    'information_schema',
    true,
    not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'professionals'
        and column_name in ('normal_birth_cents', 'cesarean_cents')
    )
  );
end;
$schema$;

-- 11b. Índice UNIQUE parcial (duas vigentes) — como dono da sessão, trigger de fechamento desligado
do $uniq$
declare
  v_ok boolean := false;
  v_policy uuid;
begin
  select policy_id into v_policy
  from public.professional_care_policy_versions
  where professional_id = 'b1b1b1b1-0001-0001-0001-000000000202'
  limit 1;

  alter table public.professional_care_policy_versions
    disable trigger professional_care_policy_versions_before_write;

  begin
    insert into public.professional_care_policy_versions (
      policy_id, professional_id, practice_id, organization_id, version_number,
      normal_birth_cents, cesarean_cents, requires_availability_for_prenatal,
      allows_prenatal_exception, effective_from
    )
    select
      policy_id, professional_id, practice_id, organization_id, 99,
      1, 1, false, false, date '2028-01-01'
    from public.professional_care_policy_versions
    where policy_id = v_policy
    limit 1;
  exception
    when unique_violation then
      v_ok := true;
  end;

  alter table public.professional_care_policy_versions
    enable trigger professional_care_policy_versions_before_write;

  perform pg_temp.record(
    'T11b', 'versão',
    'UNIQUE parcial impede duas vigentes (trigger de fechamento desligado)',
    'postgres',
    true,
    v_ok
  );
end;
$uniq$;

-- Congelamento: UPDATE de centavos em versão histórica
do $freeze$
declare
  v_ok boolean := false;
begin
  begin
    update public.professional_care_policy_versions
       set normal_birth_cents = 1
     where professional_id = 'b1b1b1b1-0001-0001-0001-000000000201'
       and version_number = 1;
  exception
    when others then
      v_ok := true;
  end;
  perform pg_temp.record(
    'T09b', 'versão',
    'UPDATE de valor histórico recusado pelo trigger',
    'postgres',
    true,
    v_ok
  );
end;
$freeze$;

select
  test_id as identificacao,
  secao,
  operacao,
  usuario as usuario_utilizado,
  esperado as resultado_esperado,
  obtido as resultado_obtido,
  case when pass then 'PASS' else 'FAIL' end as pass_fail
from b1_results
order by seq;

select
  count(*) filter (where pass) as pass,
  count(*) filter (where not pass) as fail,
  count(*) as total
from b1_results;

rollback;
