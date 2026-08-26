-- =============================================================================
-- Testes de autorização RLS — Casa Florescer
-- SOMENTE PostgreSQL LOCAL (Supabase local / Docker).
-- =============================================================================
-- NÃO usar em projeto remoto.
-- NÃO executar supabase db push.
-- NÃO altera migrations 0001–0008 nem código da aplicação.
--
-- Como rodar (somente após aprovação, stack local no ar, 0001–0008 aplicadas):
--
--   npx supabase db query --local -f supabase/tests/authorization_rls.sql
--
-- ou:
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" ^
--     -v ON_ERROR_STOP=1 -f supabase/tests/authorization_rls.sql
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

  if to_regprocedure('public.can_read_clinical(uuid, uuid, uuid)') is null
     or to_regprocedure('public.can_write_clinical(uuid)') is null
     or to_regprocedure('public.is_system_admin()') is null then
    raise exception
      'Migrations 0001–0008 não aplicadas neste banco (funções de autorização ausentes).';
  end if;
end;
$$;

create temporary table authz_results (
  seq integer generated always as identity,
  test_id text primary key,
  secao text not null,
  operacao text not null,
  usuario text not null,
  esperado text not null,
  obtido text not null,
  pass boolean not null
) on commit drop;

-- Infraestrutura do relatório: INSERT em authz_results corre como o dono
-- da sessão de teste (postgres), não como `authenticated`. Assim o
-- impersonado não precisa de GRANT em tabela de negócio nem na temp table.
revoke all on table pg_temp.authz_results from public;
revoke all on table pg_temp.authz_results from authenticated;

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
  insert into pg_temp.authz_results (test_id, secao, operacao, usuario, esperado, obtido, pass)
  values (
    p_id,
    p_secao,
    p_op,
    p_user,
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
  insert into pg_temp.authz_results (test_id, secao, operacao, usuario, esperado, obtido, pass)
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
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    p_id,
    'authenticated',
    'authenticated',
    p_email,
    crypt('test-local-only', gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    '{}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  insert into auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    p_id::text,
    p_id,
    jsonb_build_object('sub', p_id::text, 'email', p_email),
    'email',
    now(),
    now(),
    now()
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
    json_build_object(
      'sub', p_uid::text,
      'role', 'authenticated',
      'aud', 'authenticated'
    )::text,
    true
  );
end;
$$;

create or replace function pg_temp.try_insert_encounter(
  p_org uuid,
  p_practice uuid,
  p_patient uuid,
  p_professional uuid
) returns boolean
language plpgsql
as $$
begin
  insert into public.encounters (
    organization_id, practice_id, patient_id, professional_id, status
  ) values (
    p_org, p_practice, p_patient, p_professional, 'open'
  );
  return true;
exception
  when others then
    return false;
end;
$$;

create or replace function pg_temp.try_insert_note(
  p_encounter uuid,
  p_org uuid,
  p_practice uuid,
  p_created_by uuid
) returns boolean
language plpgsql
as $$
begin
  insert into public.clinical_notes (
    encounter_id, organization_id, practice_id, body_ciphertext, created_by
  ) values (
    p_encounter, p_org, p_practice, 'cipher-test', p_created_by
  );
  return true;
exception
  when others then
    return false;
end;
$$;

create or replace function pg_temp.try_update_note(p_note uuid)
returns boolean
language plpgsql
as $$
begin
  update public.clinical_notes
     set body_ciphertext = 'tamper'
   where id = p_note;
  return found;
exception
  when others then
    return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dados fictícios (sem break-glass ainda — F entra depois de A–E)
-- ---------------------------------------------------------------------------

do $seed$
declare
  v_org uuid := 'aaaaaaaa-0001-0001-0001-000000000001';
  v_house uuid := 'aaaaaaaa-0001-0001-0001-000000000010';
  v_sublet uuid := 'aaaaaaaa-0001-0001-0001-000000000011';
  v_uid_house_md uuid := 'aaaaaaaa-0001-0001-0001-000000000101';
  v_uid_house_own uuid := 'aaaaaaaa-0001-0001-0001-000000000102';
  v_uid_tenant_md uuid := 'aaaaaaaa-0001-0001-0001-000000000103';
  v_uid_secretary uuid := 'aaaaaaaa-0001-0001-0001-000000000104';
  v_uid_owner uuid := 'aaaaaaaa-0001-0001-0001-000000000105';
  v_uid_sa uuid := 'aaaaaaaa-0001-0001-0001-000000000106';
  v_prof_house uuid := 'aaaaaaaa-0001-0001-0001-000000000201';
  v_prof_house_own uuid := 'aaaaaaaa-0001-0001-0001-000000000202';
  v_prof_tenant uuid := 'aaaaaaaa-0001-0001-0001-000000000203';
  v_pat_house uuid := 'aaaaaaaa-0001-0001-0001-000000000301';
  v_pat_tenant uuid := 'aaaaaaaa-0001-0001-0001-000000000302';
  v_pat_other uuid := 'aaaaaaaa-0001-0001-0001-000000000303';
  v_enc_house uuid := 'aaaaaaaa-0001-0001-0001-000000000401';
  v_enc_house_own uuid := 'aaaaaaaa-0001-0001-0001-000000000402';
  v_enc_tenant uuid := 'aaaaaaaa-0001-0001-0001-000000000403';
  v_note_house uuid := 'aaaaaaaa-0001-0001-0001-000000000501';
  v_note_own uuid := 'aaaaaaaa-0001-0001-0001-000000000502';
begin
  perform pg_temp.make_auth_user(v_uid_house_md, 'house.md@local.test');
  perform pg_temp.make_auth_user(v_uid_house_own, 'house.own@local.test');
  perform pg_temp.make_auth_user(v_uid_tenant_md, 'tenant.md@local.test');
  perform pg_temp.make_auth_user(v_uid_secretary, 'secretary@local.test');
  perform pg_temp.make_auth_user(v_uid_owner, 'owner@local.test');
  perform pg_temp.make_auth_user(v_uid_sa, 'sysadmin@local.test');

  insert into public.organizations (id, legal_name, trade_name, cnpj)
  values (v_org, 'Casa Florescer Teste Ltda', 'Casa Florescer Teste', '11222333000181');

  insert into public.practice_units (
    id, organization_id, kind, code, name, specialty, isolation_label
  ) values
    (v_house, v_org, 'house', 'HOUSE', 'Prática Casa', 'GO', 'prontuario-casa'),
    (v_sublet, v_org, 'sublet', 'SUBLET', 'Prática Locada', 'Dermatologia', 'prontuario-locatario');

  insert into public.profiles (id, organization_id, full_name, email) values
    (v_uid_house_md, v_org, 'Médica Casa Practice', 'house.md@local.test'),
    (v_uid_house_own, v_org, 'Médica Casa OwnEnc', 'house.own@local.test'),
    (v_uid_tenant_md, v_org, 'Médico Locatário', 'tenant.md@local.test'),
    (v_uid_secretary, v_org, 'Secretaria Casa', 'secretary@local.test'),
    (v_uid_owner, v_org, 'Owner Casa', 'owner@local.test'),
    (v_uid_sa, v_org, 'System Admin', 'sysadmin@local.test');

  insert into public.user_practice_roles (user_id, practice_id, role, clinical_access)
  values
    (v_uid_owner, v_house, 'owner', 'none'),
    (v_uid_house_md, v_house, 'physician', 'practice'),
    (v_uid_house_own, v_house, 'physician', 'own_encounters'),
    (v_uid_tenant_md, v_sublet, 'physician', 'own_encounters'),
    (v_uid_secretary, v_house, 'secretary', 'none');

  insert into public.system_admins (user_id, granted_by, reason)
  values (v_uid_sa, v_uid_sa, 'bootstrap local de teste');

  insert into public.professionals (
    id, profile_id, practice_id, organization_id, council_type, council_number
  ) values
    (v_prof_house, v_uid_house_md, v_house, v_org, 'CRM', '10001'),
    (v_prof_house_own, v_uid_house_own, v_house, v_org, 'CRM', '10002'),
    (v_prof_tenant, v_uid_tenant_md, v_sublet, v_org, 'CRM', '20001');

  insert into public.patients (id, organization_id, full_name, cpf, created_by)
  values
    (v_pat_house, v_org, 'Paciente Casa', '11111111111', v_uid_secretary),
    (v_pat_tenant, v_org, 'Paciente Locatario', '22222222222', v_uid_tenant_md),
    (v_pat_other, v_org, 'Paciente Outro', '33333333333', v_uid_secretary);

  insert into public.patient_practice_links (patient_id, practice_id) values
    (v_pat_house, v_house),
    (v_pat_tenant, v_sublet),
    (v_pat_other, v_house);

  insert into public.encounters (
    id, organization_id, practice_id, patient_id, professional_id, status
  ) values
    (v_enc_house, v_org, v_house, v_pat_house, v_prof_house, 'open'),
    (v_enc_house_own, v_org, v_house, v_pat_house, v_prof_house_own, 'open'),
    (v_enc_tenant, v_org, v_sublet, v_pat_tenant, v_prof_tenant, 'open');

  insert into public.clinical_notes (
    id, encounter_id, organization_id, practice_id, body_ciphertext, created_by
  ) values
    (v_note_house, v_enc_house, v_org, v_house, 'nota-casa', v_uid_house_md),
    (v_note_own, v_enc_house_own, v_org, v_house, 'nota-own', v_uid_house_own);

  insert into public.patient_clinical_data (
    patient_id, organization_id, allergies, continuous_medications
  ) values
    (v_pat_house, v_org, 'dipirona', 'aas');
end;
$seed$;

-- Privilégios mínimos de tabela para o papel authenticated, só nesta
-- transação. Sem eles o local avalia ACL antes da RLS e o teste não chega
-- nas policies. ROLLBACK desfaz estes GRANT. Sem DELETE/TRUNCATE/REFERENCES/
-- TRIGGER/BYPASSRLS. Sem GRANT em tabelas fora da lista abaixo.
grant select, insert on table public.encounters to authenticated;
grant select on table public.patients to authenticated;
grant select, insert, update on table public.clinical_notes to authenticated;
grant select on table public.patient_clinical_data to authenticated;
grant select on table public.practice_units to authenticated;
grant select on table public.patient_practice_links to authenticated;
grant select on table public.professionals to authenticated;
grant select on table public.break_glass_grants to authenticated;

-- ---------------------------------------------------------------------------
-- A–E sob authenticated (RLS). Sem break-glass neste momento.
-- ---------------------------------------------------------------------------

set local role authenticated;

do $ae$
declare
  v_org uuid := 'aaaaaaaa-0001-0001-0001-000000000001';
  v_house uuid := 'aaaaaaaa-0001-0001-0001-000000000010';
  v_sublet uuid := 'aaaaaaaa-0001-0001-0001-000000000011';
  v_uid_house_md uuid := 'aaaaaaaa-0001-0001-0001-000000000101';
  v_uid_house_own uuid := 'aaaaaaaa-0001-0001-0001-000000000102';
  v_uid_tenant_md uuid := 'aaaaaaaa-0001-0001-0001-000000000103';
  v_uid_secretary uuid := 'aaaaaaaa-0001-0001-0001-000000000104';
  v_prof_house uuid := 'aaaaaaaa-0001-0001-0001-000000000201';
  v_prof_house_own uuid := 'aaaaaaaa-0001-0001-0001-000000000202';
  v_prof_tenant uuid := 'aaaaaaaa-0001-0001-0001-000000000203';
  v_pat_house uuid := 'aaaaaaaa-0001-0001-0001-000000000301';
  v_pat_tenant uuid := 'aaaaaaaa-0001-0001-0001-000000000302';
  v_enc_house uuid := 'aaaaaaaa-0001-0001-0001-000000000401';
  v_enc_house_own uuid := 'aaaaaaaa-0001-0001-0001-000000000402';
  v_enc_tenant uuid := 'aaaaaaaa-0001-0001-0001-000000000403';
  v_note_house uuid := 'aaaaaaaa-0001-0001-0001-000000000501';
  v_got boolean;
  v_n integer;
begin
  -- A. Isolamento
  perform pg_temp.impersonate(v_uid_house_md);
  perform pg_temp.record(
    'A1', 'A isolamento',
    'can_read_clinical(prática Casa, paciente Casa, professional Casa)',
    'physician Casa (clinical_access=practice)',
    true,
    public.can_read_clinical(v_house, v_pat_house, v_prof_house)
  );

  perform pg_temp.impersonate(v_uid_tenant_md);
  perform pg_temp.record(
    'A2', 'A isolamento',
    'can_read_clinical(prática locada, paciente locatário, professional locatário)',
    'physician locatário (own_encounters)',
    true,
    public.can_read_clinical(v_sublet, v_pat_tenant, v_prof_tenant)
  );

  perform pg_temp.impersonate(v_uid_tenant_md);
  select count(*) into v_n from public.encounters where id = v_enc_house;
  perform pg_temp.record(
    'A3', 'A isolamento',
    'SELECT encounter da prática Casa (sem break-glass)',
    'physician locatário',
    false,
    (v_n > 0)
  );

  perform pg_temp.impersonate(v_uid_house_md);
  select count(*) into v_n from public.encounters where id = v_enc_tenant;
  perform pg_temp.record(
    'A4', 'A isolamento',
    'SELECT encounter da prática locada',
    'physician Casa',
    false,
    (v_n > 0)
  );

  -- B. encounters INSERT
  perform pg_temp.impersonate(v_uid_house_md);
  v_got := pg_temp.try_insert_encounter(v_org, v_house, v_pat_house, v_prof_house);
  perform pg_temp.record(
    'B1', 'B encounters',
    'INSERT encounter com próprio professional_id e mesma practice_id',
    'physician Casa',
    true,
    v_got
  );

  perform pg_temp.impersonate(v_uid_house_md);
  v_got := pg_temp.try_insert_encounter(v_org, v_house, v_pat_house, v_prof_tenant);
  perform pg_temp.record(
    'B2', 'B encounters',
    'INSERT encounter com professional_id da prática locada',
    'physician Casa',
    false,
    v_got
  );

  perform pg_temp.impersonate(v_uid_house_md);
  v_got := pg_temp.try_insert_encounter(v_org, v_sublet, v_pat_tenant, v_prof_house);
  perform pg_temp.record(
    'B3', 'B encounters',
    'INSERT encounter com practice_id locada e professional_id da Casa',
    'physician Casa',
    false,
    v_got
  );

  -- C. clinical_access
  perform pg_temp.impersonate(v_uid_house_md);
  perform pg_temp.record(
    'C1a', 'C clinical_access',
    'SELECT encounter próprio',
    'physician Casa clinical_access=practice',
    true,
    exists (select 1 from public.encounters where id = v_enc_house)
  );
  perform pg_temp.record(
    'C1b', 'C clinical_access',
    'SELECT encounter de colega na mesma prática',
    'physician Casa clinical_access=practice',
    true,
    exists (select 1 from public.encounters where id = v_enc_house_own)
  );

  perform pg_temp.impersonate(v_uid_house_own);
  perform pg_temp.record(
    'C2a', 'C clinical_access',
    'SELECT encounter próprio',
    'physician Casa clinical_access=own_encounters',
    true,
    exists (select 1 from public.encounters where id = v_enc_house_own)
  );
  perform pg_temp.record(
    'C2b', 'C clinical_access',
    'SELECT encounter do colega na mesma prática',
    'physician Casa clinical_access=own_encounters',
    false,
    exists (select 1 from public.encounters where id = v_enc_house)
  );

  perform pg_temp.impersonate(v_uid_house_own);
  perform pg_temp.record(
    'C3', 'C clinical_access',
    'can_read_clinical(..., professional_id de outro médico)',
    'physician Casa clinical_access=own_encounters',
    false,
    public.can_read_clinical(v_house, v_pat_house, v_prof_house)
  );

  -- D. Secretaria
  perform pg_temp.impersonate(v_uid_secretary);
  perform pg_temp.record(
    'D1', 'D secretaria',
    'SELECT MPI patients (política house)',
    'secretary Casa',
    true,
    exists (select 1 from public.patients where id = v_pat_house)
  );

  select count(*) into v_n from public.clinical_notes;
  perform pg_temp.record(
    'D2', 'D secretaria',
    'SELECT clinical_notes',
    'secretary Casa',
    false,
    (v_n > 0)
  );

  v_got := pg_temp.try_insert_note(v_enc_house, v_org, v_house, v_uid_secretary);
  perform pg_temp.record(
    'D3', 'D secretaria',
    'INSERT clinical_notes',
    'secretary Casa',
    false,
    v_got
  );

  v_got := pg_temp.try_update_note(v_note_house);
  perform pg_temp.record(
    'D4', 'D secretaria',
    'UPDATE clinical_notes',
    'secretary Casa',
    false,
    v_got
  );

  select count(*) into v_n from public.patient_clinical_data;
  perform pg_temp.record(
    'D5', 'D secretaria',
    'SELECT patient_clinical_data',
    'secretary Casa',
    false,
    (v_n > 0)
  );

  -- E. Prontuário
  perform pg_temp.impersonate(v_uid_house_md);
  select count(*) into v_n from public.clinical_notes where id = v_note_house;
  perform pg_temp.record(
    'E1', 'E prontuário',
    'SELECT clinical_notes da própria prática',
    'physician Casa clinical_access=practice',
    true,
    (v_n > 0)
  );

  perform pg_temp.impersonate(v_uid_secretary);
  perform pg_temp.record(
    'E2', 'E prontuário',
    'can_read_clinical (sem physician; clinical_access=none)',
    'secretary Casa',
    false,
    public.can_read_clinical(v_house, v_pat_house, v_prof_house)
  );

  perform pg_temp.impersonate(v_uid_tenant_md);
  select count(*) into v_n from public.clinical_notes where id = v_note_house;
  perform pg_temp.record(
    'E3', 'E prontuário',
    'SELECT clinical_notes da prática Casa',
    'physician locatário (sem break-glass)',
    false,
    (v_n > 0)
  );
end;
$ae$;

reset role;

-- ---------------------------------------------------------------------------
-- F. Break-glass — grants inseridos agora, depois do isolamento A–E
-- ---------------------------------------------------------------------------

insert into public.break_glass_grants (
  id, user_id, patient_id, practice_id, reason, approved_by, starts_at, expires_at
) values
  (
    'aaaaaaaa-0001-0001-0001-000000000601',
    'aaaaaaaa-0001-0001-0001-000000000103',
    'aaaaaaaa-0001-0001-0001-000000000301',
    'aaaaaaaa-0001-0001-0001-000000000010',
    'teste grant vigente',
    'aaaaaaaa-0001-0001-0001-000000000105',
    now() - interval '5 minutes',
    now() + interval '2 hours'
  ),
  (
    'aaaaaaaa-0001-0001-0001-000000000602',
    'aaaaaaaa-0001-0001-0001-000000000103',
    'aaaaaaaa-0001-0001-0001-000000000303',
    'aaaaaaaa-0001-0001-0001-000000000010',
    'teste grant expirado',
    'aaaaaaaa-0001-0001-0001-000000000105',
    now() - interval '3 hours',
    now() - interval '1 hour'
  );

set local role authenticated;

do $f$
declare
  v_house uuid := 'aaaaaaaa-0001-0001-0001-000000000010';
  v_uid_tenant_md uuid := 'aaaaaaaa-0001-0001-0001-000000000103';
  v_prof_house uuid := 'aaaaaaaa-0001-0001-0001-000000000201';
  v_pat_house uuid := 'aaaaaaaa-0001-0001-0001-000000000301';
  v_pat_tenant uuid := 'aaaaaaaa-0001-0001-0001-000000000302';
  v_pat_other uuid := 'aaaaaaaa-0001-0001-0001-000000000303';
  v_enc_house uuid := 'aaaaaaaa-0001-0001-0001-000000000401';
begin
  perform pg_temp.impersonate(v_uid_tenant_md);

  perform pg_temp.record(
    'F1', 'F break-glass',
    'can_read_clinical + SELECT encounter Casa sob grant vigente (mesmo paciente/prática)',
    'physician locatário',
    true,
    public.has_active_break_glass(v_house, v_pat_house)
      and public.can_read_clinical(v_house, v_pat_house, v_prof_house)
      and exists (select 1 from public.encounters where id = v_enc_house)
  );

  perform pg_temp.record(
    'F2', 'F break-glass',
    'has_active_break_glass(prática Casa, paciente cujo único grant já expirou)',
    'physician locatário',
    false,
    public.has_active_break_glass(v_house, v_pat_other)
  );

  perform pg_temp.record(
    'F3', 'F break-glass',
    'can_read_clinical(prática Casa, paciente locatário) — grant vigente é de outro paciente',
    'physician locatário',
    false,
    public.can_read_clinical(v_house, v_pat_tenant, v_prof_house)
  );
end;
$f$;

reset role;

-- ---------------------------------------------------------------------------
-- G. SYSTEM_ADMIN — catálogo (postgres)
-- ---------------------------------------------------------------------------

do $g$
declare
  v_master boolean;
  v_role_col boolean;
  v_policy boolean;
  v_src text;
begin
  select exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'is_master_admin'
  ) into v_master;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'role'
  ) into v_role_col;

  select exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and policyname = 'master_admin_all'
  ) into v_policy;

  select pg_get_functiondef('public.is_system_admin()'::regprocedure) into v_src;

  perform pg_temp.record_text(
    'G1', 'G SYSTEM_ADMIN',
    'is_system_admin() deriva só de public.system_admins (user_id + revoked_at is null)',
    'definição da função',
    'system_admins é a fonte',
    case
      when v_src ilike '%system_admins%'
       and v_src ilike '%revoked_at is null%'
       and v_src not ilike '%profiles.role%'
      then 'system_admins é a fonte'
      else 'definição inesperada'
    end
  );

  perform pg_temp.record_text(
    'G2', 'G SYSTEM_ADMIN',
    'função public.is_master_admin',
    'pg_proc',
    'ausente',
    case when v_master then 'presente' else 'ausente' end
  );

  perform pg_temp.record_text(
    'G3', 'G SYSTEM_ADMIN',
    'coluna public.profiles.role',
    'information_schema.columns',
    'ausente',
    case when v_role_col then 'presente' else 'ausente' end
  );

  perform pg_temp.record_text(
    'G4', 'G SYSTEM_ADMIN',
    'policy master_admin_all',
    'pg_policies',
    'ausente',
    case when v_policy then 'presente' else 'ausente' end
  );
end;
$g$;

select
  test_id as identificacao,
  secao,
  operacao,
  usuario as usuario_utilizado,
  esperado as resultado_esperado,
  obtido as resultado_obtido,
  case when pass then 'PASS' else 'FAIL' end as pass_fail
from authz_results
order by seq;

select
  count(*) filter (where pass) as pass,
  count(*) filter (where not pass) as fail,
  count(*) as total
from authz_results;

rollback;
