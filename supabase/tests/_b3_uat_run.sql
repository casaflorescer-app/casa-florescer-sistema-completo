-- =============================================================================
-- CASA FLORESCER — FASE B3 UAT (dados fictícios TESTE B3 —)
-- NÃO apaga dados reais. NÃO altera schema/migrations.
-- Executar: npx supabase db query --linked -f supabase/tests/_b3_uat_run.sql
-- =============================================================================

create temporary table if not exists b3_results (
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

truncate b3_results;

create or replace function pg_temp.rec(
  p_id text, p_secao text, p_op text, p_user text,
  p_esperado text, p_obtido text, p_detail text default null
) returns void language plpgsql as $$
begin
  insert into b3_results(test_id, secao, operacao, usuario, esperado, obtido, pass, detail)
  values (p_id, p_secao, p_op, p_user, p_esperado, p_obtido, p_esperado is not distinct from p_obtido, p_detail)
  on conflict (test_id) do update set
    secao=excluded.secao, operacao=excluded.operacao, usuario=excluded.usuario,
    esperado=excluded.esperado, obtido=excluded.obtido, pass=excluded.pass, detail=excluded.detail;
end;
$$;

create or replace function pg_temp.rec_bool(
  p_id text, p_secao text, p_op text, p_user text,
  p_esperado boolean, p_obtido boolean, p_detail text default null
) returns void language plpgsql as $$
begin
  perform pg_temp.rec(
    p_id, p_secao, p_op, p_user,
    case when p_esperado then 'permitido' else 'bloqueado' end,
    case when p_obtido then 'permitido' else 'bloqueado' end,
    p_detail
  );
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

create or replace function pg_temp.ensure_auth_user(
  p_id uuid, p_email text, p_name text
) returns void language plpgsql as $$
declare
  v_instance uuid;
begin
  select id into v_instance from auth.instances limit 1;
  if v_instance is null then
    v_instance := '00000000-0000-0000-0000-000000000000';
  end if;

  if not exists (select 1 from auth.users where id = p_id) then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) values (
      v_instance, p_id, 'authenticated', 'authenticated', p_email,
      crypt('TESTE-B3-nao-usar-em-prod', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', p_name),
      now(), now(), '', '', '', ''
    );
  end if;

  if not exists (select 1 from auth.identities where user_id = p_id and provider = 'email') then
    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), p_id,
      jsonb_build_object('sub', p_id::text, 'email', p_email),
      'email', p_id::text, now(), now(), now()
    );
  end if;
end;
$$;

do $b3$
declare
  v_org uuid := '22e69ed4-0797-4742-b00e-f625317c6931';
  v_house uuid := '7673bc0e-a789-4edd-b32f-392e407cc062';
  v_uid_samara uuid := 'e7eccd47-7bba-44f0-8c5c-558b7a998084';
  v_uid_thais uuid := '577808fc-50dc-4e70-a64e-6cd1a6ab10f7';
  v_uid_owner uuid := '0a8b2369-7fb9-4727-9043-37710ef1679b';
  v_uid_sec_exist uuid := '901023bc-f7d8-43a0-a483-68979ffdf4aa';
  v_prof_samara uuid := 'acbb0eb6-2994-49c2-b083-63e4382f3f2c';
  v_prof_thais uuid := 'e3444eb1-9817-4659-96bd-9cd1d08f783c';

  v_practice_b uuid := 'b3000001-0000-4000-8000-0000000000b3';
  v_uid_med_b uuid := 'b3000002-0000-4000-8000-0000000000b3';
  v_uid_sec_b uuid := 'b3000003-0000-4000-8000-0000000000b3';
  v_uid_sec_no uuid := 'b3000004-0000-4000-8000-0000000000b3';
  v_uid_sec_yes uuid := 'b3000005-0000-4000-8000-0000000000b3';
  v_uid_inactive uuid := 'b3000006-0000-4000-8000-0000000000b3';
  v_uid_nomemb uuid := 'b3000007-0000-4000-8000-0000000000b3';
  v_prof_b uuid := 'b3000008-0000-4000-8000-0000000000b3';

  v_memb_sec_no uuid;
  v_memb_sec_yes uuid;
  v_memb_sec_b uuid;
  v_memb_exist uuid;

  v_patient_a uuid := 'b3000010-0000-4000-8000-0000000000b3';
  v_patient_b uuid := 'b3000011-0000-4000-8000-0000000000b3';
  v_preg_a uuid := 'b3000012-0000-4000-8000-0000000000b3';
  v_preg_b uuid := 'b3000013-0000-4000-8000-0000000000b3';
  v_preg_dup uuid := 'b3000014-0000-4000-8000-0000000000b3';
  v_preg_close uuid := 'b3000015-0000-4000-8000-0000000000b3';

  v_proc_prin uuid;
  v_proc_back uuid;
  v_proc_b uuid;
  v_payout uuid;
  v_payout2 uuid;
  v_policy_ver uuid;
  v_ok boolean;
  v_n integer;
  v_amount integer;
  v_status text;
  v_calc date;
  v_edd date;
  v_ig text;
  v_err text;
  v_ledger_pending integer;
  v_ledger_settled integer;
  v_outflow integer;
  v_inflow integer;
  v_reverse integer;
begin
  -- META
  perform pg_temp.rec('M0015', 'meta', 'migration 0015', 'db', 'sim',
    case when exists (select 1 from supabase_migrations.schema_migrations where version='0015') then 'sim' else 'nao' end);

  -- ========== SEED USERS / PRACTICE B ==========
  perform pg_temp.clear_auth();

  perform pg_temp.ensure_auth_user(v_uid_med_b, 'teste.b3.medica.b@exemplo.local', 'TESTE B3 — Médica Prática B');
  perform pg_temp.ensure_auth_user(v_uid_sec_b, 'teste.b3.secretaria.b@exemplo.local', 'TESTE B3 — Secretária Prática B');
  perform pg_temp.ensure_auth_user(v_uid_sec_no, 'teste.b3.secretaria.sem@exemplo.local', 'TESTE B3 — Secretária SEM permissão');
  perform pg_temp.ensure_auth_user(v_uid_sec_yes, 'teste.b3.secretaria.com@exemplo.local', 'TESTE B3 — Secretária COM permissão');
  perform pg_temp.ensure_auth_user(v_uid_inactive, 'teste.b3.inativa@exemplo.local', 'TESTE B3 — Usuária Inativa');
  perform pg_temp.ensure_auth_user(v_uid_nomemb, 'teste.b3.sem.membership@exemplo.local', 'TESTE B3 — Sem Membership');

  insert into public.profiles (id, organization_id, full_name, email, is_active)
  values
    (v_uid_med_b, v_org, 'TESTE B3 — Médica Prática B', 'teste.b3.medica.b@exemplo.local', true),
    (v_uid_sec_b, v_org, 'TESTE B3 — Secretária Prática B', 'teste.b3.secretaria.b@exemplo.local', true),
    (v_uid_sec_no, v_org, 'TESTE B3 — Secretária SEM permissão', 'teste.b3.secretaria.sem@exemplo.local', true),
    (v_uid_sec_yes, v_org, 'TESTE B3 — Secretária COM permissão', 'teste.b3.secretaria.com@exemplo.local', true),
    (v_uid_inactive, v_org, 'TESTE B3 — Usuária Inativa', 'teste.b3.inativa@exemplo.local', false),
    (v_uid_nomemb, v_org, 'TESTE B3 — Sem Membership', 'teste.b3.sem.membership@exemplo.local', true)
  on conflict (id) do update set full_name = excluded.full_name, is_active = excluded.is_active;

  insert into public.practice_units (
    id, organization_id, kind, code, name, specialty, isolation_label, is_active
  ) values (
    v_practice_b, v_org, 'sublet', 'TESTE-B3-B', 'TESTE B3 — Prática B',
    'Ginecologia', 'TESTE B3 isolation B', true
  ) on conflict (id) do nothing;

  insert into public.professionals (
    id, profile_id, practice_id, organization_id, council_type, council_number
  ) values (
    v_prof_b, v_uid_med_b, v_practice_b, v_org, 'CRM', 'B3-99999'
  ) on conflict (id) do nothing;

  insert into public.user_practice_roles (
    user_id, practice_id, role, clinical_access, can_view_care_policies
  ) values
    (v_uid_med_b, v_practice_b, 'physician', 'own_encounters', false),
    (v_uid_sec_b, v_practice_b, 'secretary', 'none', false),
    (v_uid_sec_no, v_house, 'secretary', 'none', false),
    (v_uid_sec_yes, v_house, 'secretary', 'none', false),
    (v_uid_inactive, v_house, 'secretary', 'none', false)
  on conflict (user_id, practice_id, role) do nothing;

  select id into v_memb_sec_no from user_practice_roles
    where user_id=v_uid_sec_no and practice_id=v_house and role='secretary';
  select id into v_memb_sec_yes from user_practice_roles
    where user_id=v_uid_sec_yes and practice_id=v_house and role='secretary';
  select id into v_memb_sec_b from user_practice_roles
    where user_id=v_uid_sec_b and practice_id=v_practice_b and role='secretary';
  select id into v_memb_exist from user_practice_roles
    where user_id=v_uid_sec_exist and practice_id=v_house and role='secretary';

  -- Ensure sec_yes starts WITHOUT flag then we enable via RPC
  update user_practice_roles set can_view_care_policies = false where id = v_memb_sec_yes;
  update user_practice_roles set can_view_care_policies = false where id = v_memb_sec_no;

  insert into public.procedures (organization_id, practice_id, code, name, duration_min, is_shared)
  values (v_org, null, 'OBSTETRIC_BIRTH', 'Parto obstétrico', 60, true)
  on conflict (organization_id, code) do nothing;

  -- ========== FASE A — paciente + gestação ==========
  perform pg_temp.impersonate(v_uid_owner);
  insert into public.patients (id, organization_id, full_name, cpf, birth_date, phone, created_by)
  values
    (v_patient_a, v_org, 'TESTE B3 — PACIENTE PRÁTICA A', '90000000001', '1990-01-15', '11999990001', v_uid_owner),
    (v_patient_b, v_org, 'TESTE B3 — PACIENTE PRÁTICA B', '90000000002', '1992-03-20', '11999990002', v_uid_owner)
  on conflict (id) do nothing;

  insert into public.patient_practice_links (patient_id, practice_id)
  values (v_patient_a, v_house), (v_patient_b, v_practice_b)
  on conflict do nothing;

  -- create pregnancy A: Samara principal, Thais backup (no grant yet)
  perform pg_temp.impersonate(v_uid_samara);
  begin
    insert into public.pregnancies (
      id, organization_id, practice_id, patient_id,
      primary_professional_id, backup_professional_id,
      status, lmp_date, clinical_edd, notes, created_by
    ) values (
      v_preg_a, v_org, v_house, v_patient_a,
      v_prof_samara, v_prof_thais,
      'in_care', current_date - 84, current_date + (280-84),
      'TESTE B3 — gestação A principal Samara', v_uid_samara
    );
    v_ok := true;
  exception when others then
    v_ok := false; v_err := sqlerrm;
    -- may already exist from prior run
    if exists (select 1 from pregnancies where id=v_preg_a) then v_ok := true; end if;
  end;
  perform pg_temp.rec_bool('A01', 'fase_a', 'criar gestação', 'samara', true, v_ok, v_err);

  select calculated_edd, clinical_edd into v_calc, v_edd from pregnancies where id=v_preg_a;
  perform pg_temp.rec('A02', 'fase_a', 'DPP calculada preenchida', 'db', 'sim',
    case when v_calc is not null then 'sim' else 'nao' end, v_calc::text);
  perform pg_temp.rec('A03', 'fase_a', 'DPP clínica preservada', 'db', 'sim',
    case when v_edd is not null then 'sim' else 'nao' end, v_edd::text);

  -- duplicate active pregnancy blocked
  begin
    insert into public.pregnancies (
      id, organization_id, practice_id, patient_id,
      primary_professional_id, status, lmp_date, notes, created_by
    ) values (
      v_preg_dup, v_org, v_house, v_patient_a,
      v_prof_samara, 'in_care', current_date - 30,
      'TESTE B3 — duplicata ativa (deve falhar)', v_uid_samara
    );
    v_ok := true;
  exception when others then
    v_ok := false; v_err := sqlerrm;
  end;
  perform pg_temp.rec_bool('A04', 'fase_a', 'duplicidade gestação ativa', 'samara', false, v_ok, v_err);

  -- pregnancy B
  perform pg_temp.impersonate(v_uid_med_b);
  begin
    insert into public.pregnancies (
      id, organization_id, practice_id, patient_id,
      primary_professional_id, status, lmp_date, notes, created_by
    ) values (
      v_preg_b, v_org, v_practice_b, v_patient_b,
      v_prof_b, 'in_care', current_date - 60,
      'TESTE B3 — gestação B', v_uid_med_b
    );
    v_ok := true;
  exception when others then
    v_ok := false; v_err := sqlerrm;
    if exists (select 1 from pregnancies where id=v_preg_b) then v_ok := true; end if;
  end;
  perform pg_temp.rec_bool('A05', 'fase_a', 'criar gestação prática B', 'medica_b', true, v_ok, v_err);

  -- ========== RETAGUARDA ==========
  -- Without grant: thais cannot access? can_access_pregnancy - secretary/owner/admin/principal OR active grant
  -- Actually can_access_pregnancy allows owner/admin/secretary of practice + principal + active backup grant
  -- So thais WITHOUT grant should NOT access if she's only backup physician without grant
  perform pg_temp.impersonate(v_uid_thais);
  select public.can_access_pregnancy(v_preg_a, v_house, v_patient_a, v_prof_samara) into v_ok;
  -- Wait: signature might be different. Check migration.
  -- From earlier: can_access_pregnancy(pregnancy_id, practice, patient, primary_professional)
  -- Thais is backup without grant - should be false UNLESS she's house staff via membership
  -- Thais is physician of house - is_house_staff / has_practice_role physician might grant access via can_access_pregnancy!
  -- Need to verify actual function body.

  -- Ensure no active grant first
  perform pg_temp.clear_auth();
  update pregnancy_backup_grants
    set revoked_at = coalesce(revoked_at, now())
  where pregnancy_id = v_preg_a and revoked_at is null;

  perform pg_temp.impersonate(v_uid_thais);
  begin
    select public.can_access_pregnancy(v_preg_a, v_house, v_patient_a, v_prof_samara) into v_ok;
  exception when others then
    -- try alternate: maybe only pregnancy id
    begin
      execute 'select public.can_access_pregnancy($1)' into v_ok using v_preg_a;
    exception when others then
      v_ok := null; v_err := sqlerrm;
    end;
  end;

  -- Record raw helper result for analysis
  perform pg_temp.rec('R00', 'retaguarda', 'can_access_pregnancy thais sem grant', 'thais',
    'bloqueado', case when v_ok then 'permitido' when v_ok is false then 'bloqueado' else 'erro' end,
    coalesce(v_err, v_ok::text));

  -- Principal grant
  perform pg_temp.impersonate(v_uid_samara);
  begin
    perform public.grant_pregnancy_backup_access(v_preg_a);
    v_ok := true;
  exception when others then
    v_ok := false; v_err := sqlerrm;
  end;
  perform pg_temp.rec_bool('R01', 'retaguarda', 'grant pela principal', 'samara', true, v_ok, v_err);

  perform pg_temp.impersonate(v_uid_thais);
  begin
    select public.can_access_pregnancy(v_preg_a, v_house, v_patient_a, v_prof_samara) into v_ok;
  exception when others then
    execute 'select public.can_access_pregnancy($1)' into v_ok using v_preg_a;
  end;
  perform pg_temp.rec_bool('R02', 'retaguarda', 'acesso thais com grant', 'thais', true, coalesce(v_ok,false), null);

  -- Revoke
  perform pg_temp.impersonate(v_uid_samara);
  begin
    perform public.revoke_pregnancy_backup_access(v_preg_a);
    v_ok := true;
  exception when others then
    v_ok := false; v_err := sqlerrm;
  end;
  perform pg_temp.rec_bool('R03', 'retaguarda', 'revoke pela principal', 'samara', true, v_ok, v_err);

  perform pg_temp.impersonate(v_uid_thais);
  begin
    select public.can_access_pregnancy(v_preg_a, v_house, v_patient_a, v_prof_samara) into v_ok;
  exception when others then
    execute 'select public.can_access_pregnancy($1)' into v_ok using v_preg_a;
  end;
  perform pg_temp.rec('R04', 'retaguarda', 'acesso thais após revoke', 'thais',
    'bloqueado', case when v_ok then 'permitido' else 'bloqueado' end, v_ok::text);

  -- Re-grant for B2 tests
  perform pg_temp.impersonate(v_uid_samara);
  begin
    perform public.grant_pregnancy_backup_access(v_preg_a);
  exception when others then null;
  end;

  -- Médica B cannot access pregnancy A
  perform pg_temp.impersonate(v_uid_med_b);
  begin
    select public.can_access_pregnancy(v_preg_a, v_house, v_patient_a, v_prof_samara) into v_ok;
  exception when others then
    begin
      execute 'select public.can_access_pregnancy($1)' into v_ok using v_preg_a;
    exception when others then v_ok := false;
    end;
  end;
  perform pg_temp.rec_bool('I01', 'isolamento', 'prática B acessa gestação A', 'medica_b', false, coalesce(v_ok,false), null);

  -- ========== B1 POLÍTICA ==========
  perform pg_temp.impersonate(v_uid_samara);
  begin
    v_policy_ver := public.publish_professional_care_policy_version(
      v_prof_samara, v_house, 350000, 550000, true, false, current_date
    );
    v_ok := true;
  exception when others then
    v_ok := false; v_err := sqlerrm; v_policy_ver := null;
  end;
  perform pg_temp.rec_bool('B101', 'b1', 'publicar política samara', 'samara', true, v_ok, coalesce(v_policy_ver::text, v_err));

  -- médica B cannot manage samara policy
  perform pg_temp.impersonate(v_uid_med_b);
  begin
    perform public.publish_professional_care_policy_version(
      v_prof_samara, v_house, 1, 1, false, false, current_date
    );
    v_ok := true;
  exception when others then
    v_ok := false; v_err := sqlerrm;
  end;
  perform pg_temp.rec_bool('I02', 'isolamento', 'prática B publica política A', 'medica_b', false, v_ok, v_err);

  -- ========== SECRETÁRIA ==========
  -- without flag
  perform pg_temp.impersonate(v_uid_sec_no);
  select public.can_view_practice_care_policies(v_house) into v_ok;
  perform pg_temp.rec_bool('S01', 'secretaria', 'view policies SEM flag', 'sec_sem', false, coalesce(v_ok,false), null);

  -- enable flag via owner
  perform pg_temp.impersonate(v_uid_owner);
  begin
    perform public.set_secretary_care_policy_view(v_memb_sec_yes, true);
    v_ok := true;
  exception when others then
    v_ok := false; v_err := sqlerrm;
  end;
  perform pg_temp.rec_bool('S02', 'secretaria', 'owner habilita flag', 'owner', true, v_ok, v_err);

  perform pg_temp.impersonate(v_uid_sec_yes);
  select public.can_view_practice_care_policies(v_house) into v_ok;
  perform pg_temp.rec_bool('S03', 'secretaria', 'view policies COM flag', 'sec_com', true, coalesce(v_ok,false), null);

  -- cannot publish
  perform pg_temp.impersonate(v_uid_sec_yes);
  begin
    perform public.publish_professional_care_policy_version(
      v_prof_samara, v_house, 999, 999, false, false, current_date
    );
    v_ok := true;
  exception when others then
    v_ok := false; v_err := sqlerrm;
  end;
  perform pg_temp.rec_bool('S04', 'secretaria', 'publicar política COM flag', 'sec_com', false, v_ok, v_err);

  -- payout read must stay blocked even with flag
  perform pg_temp.impersonate(v_uid_sec_yes);
  select public.can_read_pregnancy_procedure_payout(v_house, v_prof_samara, v_prof_thais) into v_ok;
  perform pg_temp.rec_bool('S05', 'secretaria', 'ler repasse COM flag', 'sec_com', false, coalesce(v_ok,false), null);

  -- ========== B2 PROCEDIMENTO + REPASSE + LEDGER ==========
  perform pg_temp.impersonate(v_uid_samara);
  begin
    v_proc_prin := public.create_pregnancy_procedure(
      v_preg_a, 'OBSTETRIC_BIRTH', v_prof_samara, current_date, 'TESTE B3 — parto principal'
    );
  exception when others then
    v_proc_prin := null; v_err := sqlerrm;
  end;
  perform pg_temp.rec_bool('P01', 'b2', 'proc principal', 'samara', true, v_proc_prin is not null, coalesce(v_proc_prin::text, v_err));

  begin
    v_proc_back := public.create_pregnancy_procedure(
      v_preg_a, 'OBSTETRIC_BIRTH', v_prof_thais, current_date, 'TESTE B3 — parto retaguarda'
    );
  exception when others then
    v_proc_back := null; v_err := sqlerrm;
  end;
  perform pg_temp.rec_bool('P02', 'b2', 'proc retaguarda', 'samara', true, v_proc_back is not null, coalesce(v_proc_back::text, v_err));

  -- payout on principal blocked
  begin
    v_payout := public.create_pregnancy_procedure_payout(v_proc_prin, 200000, 'nao deve', null);
  exception when others then
    v_payout := null;
  end;
  perform pg_temp.rec_bool('P03', 'repasse', 'payout sobre proc principal', 'samara', false, v_payout is not null, null);

  -- create payout pending
  begin
    v_payout := public.create_pregnancy_procedure_payout(v_proc_back, 275000, 'TESTE B3 — repasse 2750', null);
  exception when others then
    v_payout := null; v_err := sqlerrm;
  end;
  perform pg_temp.rec_bool('P04', 'repasse', 'criar payout pending', 'samara', true, v_payout is not null, coalesce(v_payout::text, v_err));

  select amount_cents, status into v_amount, v_status from pregnancy_procedure_payouts where id=v_payout;
  perform pg_temp.rec('P05', 'repasse', 'amount_cents', 'db', '275000', coalesce(v_amount::text,'null'), null);
  perform pg_temp.rec('P06', 'repasse', 'status pending', 'db', 'pending', coalesce(v_status,'null'), null);

  select count(*) into v_ledger_pending from professional_payout_ledger_entries where payout_id = v_payout;
  perform pg_temp.rec('L01', 'ledger', 'pending sem lançamentos', 'db', '0', coalesce(v_ledger_pending::text,'null'), null);

  -- update amount while pending
  perform pg_temp.impersonate(v_uid_samara);
  begin
    perform public.update_pregnancy_procedure_payout_amount(v_payout, 280000);
    v_ok := true;
  exception when others then
    v_ok := false; v_err := sqlerrm;
  end;
  perform pg_temp.rec_bool('P07', 'repasse', 'alterar valor pending', 'samara', true, v_ok, v_err);

  -- thais notes ok, amount blocked
  perform pg_temp.impersonate(v_uid_thais);
  begin
    perform public.update_pregnancy_procedure_payout_notes(v_payout, 'TESTE B3 — notes retaguarda');
    v_ok := true;
  exception when others then
    v_ok := false; v_err := sqlerrm;
  end;
  perform pg_temp.rec_bool('P08', 'repasse', 'notes retaguarda', 'thais', true, v_ok, v_err);

  begin
    perform public.update_pregnancy_procedure_payout_amount(v_payout, 1);
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  perform pg_temp.rec_bool('P09', 'repasse', 'amount pela retaguarda', 'thais', false, v_ok, null);

  -- third/other blocked
  perform pg_temp.impersonate(v_uid_med_b);
  select public.can_read_pregnancy_procedure_payout(v_house, v_prof_samara, v_prof_thais) into v_ok;
  perform pg_temp.rec_bool('P10', 'repasse', 'ler payout prática B', 'medica_b', false, coalesce(v_ok,false), null);

  begin
    perform public.settle_pregnancy_procedure_payout(v_payout, current_date);
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  perform pg_temp.rec_bool('P11', 'repasse', 'settle pela prática B', 'medica_b', false, v_ok, null);

  -- secretary blocked settle
  perform pg_temp.impersonate(v_uid_sec_yes);
  begin
    perform public.settle_pregnancy_procedure_payout(v_payout, current_date);
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  perform pg_temp.rec_bool('P12', 'repasse', 'settle pela secretária', 'sec_com', false, v_ok, null);

  -- settle by principal
  perform pg_temp.impersonate(v_uid_samara);
  begin
    perform public.settle_pregnancy_procedure_payout(v_payout, current_date);
    v_ok := true;
  exception when others then
    v_ok := false; v_err := sqlerrm;
  end;
  perform pg_temp.rec_bool('P13', 'repasse', 'settle pela principal', 'samara', true, v_ok, v_err);

  select count(*) into v_ledger_settled from professional_payout_ledger_entries where payout_id = v_payout;
  select count(*) into v_outflow from professional_payout_ledger_entries
    where payout_id=v_payout and direction='outflow' and effect='post';
  select count(*) into v_inflow from professional_payout_ledger_entries
    where payout_id=v_payout and direction='inflow' and effect='post';
  perform pg_temp.rec('L02', 'ledger', 'lançamentos pós settle', 'db', '2', coalesce(v_ledger_settled::text,'null'), null);
  perform pg_temp.rec('L03', 'ledger', 'outflow principal', 'db', '1', coalesce(v_outflow::text,'null'), null);
  perform pg_temp.rec('L04', 'ledger', 'inflow retaguarda', 'db', '1', coalesce(v_inflow::text,'null'), null);

  -- cancel after settle → reverse
  perform pg_temp.impersonate(v_uid_samara);
  begin
    perform public.cancel_pregnancy_procedure_payout(v_payout, 'TESTE B3 — cancel pós settle');
    v_ok := true;
  exception when others then
    v_ok := false; v_err := sqlerrm;
  end;
  perform pg_temp.rec_bool('P14', 'repasse', 'cancel após settle', 'samara', true, v_ok, v_err);

  select count(*) into v_reverse from professional_payout_ledger_entries
    where payout_id=v_payout and effect='reverse';
  perform pg_temp.rec('L05', 'ledger', 'reverse após cancel', 'db', '2', coalesce(v_reverse::text,'null'),
    (select count(*)::text from professional_payout_ledger_entries where payout_id=v_payout));

  -- new payout + cancel while pending (no ledger)
  perform pg_temp.impersonate(v_uid_samara);
  -- need another backup proc or reuse? one active payout per procedure - cancelled frees
  begin
    v_payout2 := public.create_pregnancy_procedure_payout(v_proc_back, 100000, 'TESTE B3 — payout2 pending cancel', null);
  exception when others then
    v_payout2 := null; v_err := sqlerrm;
  end;
  perform pg_temp.rec_bool('P15', 'repasse', 'novo payout após cancel', 'samara', true, v_payout2 is not null, coalesce(v_payout2::text, v_err));

  if v_payout2 is not null then
    begin
      perform public.cancel_pregnancy_procedure_payout(v_payout2, 'TESTE B3 — cancel pending');
      v_ok := true;
    exception when others then
      v_ok := false; v_err := sqlerrm;
    end;
    perform pg_temp.rec_bool('P16', 'repasse', 'cancel pending', 'samara', true, v_ok, v_err);
    select count(*) into v_n from professional_payout_ledger_entries where payout_id=v_payout2;
    perform pg_temp.rec('L06', 'ledger', 'cancel pending sem ledger', 'db', '0', coalesce(v_n::text,'null'), null);
  end if;

  -- Practice B procedure isolation
  perform pg_temp.impersonate(v_uid_med_b);
  begin
    v_proc_b := public.create_pregnancy_procedure(
      v_preg_b, 'OBSTETRIC_BIRTH', v_prof_b, current_date, 'TESTE B3 — parto prática B'
    );
  exception when others then
    v_proc_b := null; v_err := sqlerrm;
  end;
  perform pg_temp.rec_bool('I03', 'isolamento', 'proc na prática B', 'medica_b', true, v_proc_b is not null, coalesce(v_proc_b::text, v_err));

  perform pg_temp.impersonate(v_uid_samara);
  begin
    perform public.create_pregnancy_procedure(
      v_preg_b, 'OBSTETRIC_BIRTH', v_prof_samara, current_date, 'nao'
    );
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  perform pg_temp.rec_bool('I04', 'isolamento', 'samara cria proc em gestação B', 'samara', false, v_ok, null);

  -- ========== INACTIVE / NO MEMBERSHIP ==========
  perform pg_temp.impersonate(v_uid_inactive);
  select public.can_view_practice_care_policies(v_house) into v_ok;
  perform pg_temp.rec_bool('X01', 'auth', 'inativa view policies', 'inactive', false, coalesce(v_ok,false), null);

  perform pg_temp.impersonate(v_uid_nomemb);
  begin
    select public.can_access_pregnancy(v_preg_a, v_house, v_patient_a, v_prof_samara) into v_ok;
  exception when others then
    v_ok := false;
  end;
  perform pg_temp.rec_bool('X02', 'auth', 'sem membership acessa gestação', 'nomemb', false, coalesce(v_ok,false), null);

  -- ========== AUDITORIA amostral ==========
  perform pg_temp.clear_auth();
  select count(*) into v_n from audit_events
    where occurred_at > now() - interval '2 hours'
      and (
        entity_id in (v_preg_a, coalesce(v_payout, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(v_payout2, '00000000-0000-0000-0000-000000000000'::uuid))
        or coalesce(metadata->>'notes','') like 'TESTE B3%'
        or entity_table in ('pregnancy_backup_grants','pregnancy_procedure_payouts','professional_care_policy_versions','pregnancies')
      );
  perform pg_temp.rec('AU01', 'auditoria', 'eventos recentes B3 (>0)', 'db', 'sim',
    case when v_n > 0 then 'sim' else 'nao' end, v_n::text);

  -- Close pregnancy
  perform pg_temp.impersonate(v_uid_samara);
  begin
    update pregnancies set status='closed' where id=v_preg_a and status='in_care';
    v_ok := found;
  exception when others then
    v_ok := false; v_err := sqlerrm;
  end;
  perform pg_temp.rec_bool('A06', 'fase_a', 'encerrar gestação', 'samara', true, v_ok, v_err);

  perform pg_temp.clear_auth();
end;
$b3$;

select test_id, secao, operacao, usuario, esperado, obtido, pass, detail
from b3_results
order by seq;
