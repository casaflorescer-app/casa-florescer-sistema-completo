-- C082 — sessão, privilégio e os recortes que a C077 não cobre.
-- A transação termina em rollback. Não deixa organização, usuário nem paciente.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000101', 'samara.c082@example.com'),
  ('00000000-0000-4000-8000-000000000102', 'thais.c082@example.com'),
  ('00000000-0000-4000-8000-000000000103', 'secretaria.c082@example.com'),
  ('00000000-0000-4000-8000-000000000104', 'admin.c082@example.com'),
  ('00000000-0000-4000-8000-000000000105', 'plantao.c082@example.com'),
  ('00000000-0000-4000-8000-000000000106', 'retaguarda.c082@example.com'),
  ('00000000-0000-4000-8000-000000000107', 'paciente.c082@example.com');

insert into public.organizations (id, legal_name, trade_name, cnpj) values
  ('00000000-0000-4000-8000-000000000181', 'Casa Florescer C082', 'Casa Florescer C082', '00000000000082');

insert into public.practice_units (id, organization_id, kind, code, name, specialty, isolation_label) values
  ('00000000-0000-4000-8000-000000000182', '00000000-0000-4000-8000-000000000181', 'house', 'SAMARA-C082', 'Samara', 'ginecologia', 'Prática Samara'),
  ('00000000-0000-4000-8000-000000000183', '00000000-0000-4000-8000-000000000181', 'house', 'THAIS-C082', 'Thais', 'ginecologia', 'Prática Thais');

insert into public.profiles (id, organization_id, full_name, email) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000181', 'Samara', 'samara.c082@example.com'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000181', 'Thais', 'thais.c082@example.com'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000181', 'Secretária', 'secretaria.c082@example.com'),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000181', 'Administradora', 'admin.c082@example.com'),
  ('00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-000000000181', 'Plantão', 'plantao.c082@example.com'),
  ('00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-000000000181', 'Retaguarda', 'retaguarda.c082@example.com');

insert into public.user_practice_roles (user_id, practice_id, role, clinical_access, can_cashier, can_schedule_any_practice) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000182', 'physician', 'practice', true, false),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000183', 'physician', 'practice', true, false),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000182', 'secretary', 'none', false, true),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000182', 'admin', 'none', false, true);

insert into public.professionals (id, profile_id, practice_id, organization_id, council_type, council_number) values
  ('00000000-0000-4000-8000-000000000121', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000182', '00000000-0000-4000-8000-000000000181', 'CRM', 'C082-S'),
  ('00000000-0000-4000-8000-000000000122', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000183', '00000000-0000-4000-8000-000000000181', 'CRM', 'C082-T'),
  ('00000000-0000-4000-8000-000000000123', '00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-000000000183', '00000000-0000-4000-8000-000000000181', 'CRM', 'C082-R');

insert into public.patients (id, organization_id, full_name) values
  ('00000000-0000-4000-8000-000000000131', '00000000-0000-4000-8000-000000000181', 'Paciente das duas');

insert into public.patient_practice_links (patient_id, practice_id) values
  ('00000000-0000-4000-8000-000000000131', '00000000-0000-4000-8000-000000000182'),
  ('00000000-0000-4000-8000-000000000131', '00000000-0000-4000-8000-000000000183');

insert into public.patient_accounts (user_id, patient_id, organization_id) values
  ('00000000-0000-4000-8000-000000000107', '00000000-0000-4000-8000-000000000131', '00000000-0000-4000-8000-000000000181');

insert into public.patient_clinical_data (patient_id, organization_id, practice_id, allergies) values
  ('00000000-0000-4000-8000-000000000131', '00000000-0000-4000-8000-000000000181', '00000000-0000-4000-8000-000000000182', 'ficha-samara'),
  ('00000000-0000-4000-8000-000000000131', '00000000-0000-4000-8000-000000000181', '00000000-0000-4000-8000-000000000183', 'ficha-thais');

insert into public.encounters (id, organization_id, practice_id, patient_id, professional_id) values
  ('00000000-0000-4000-8000-000000000161', '00000000-0000-4000-8000-000000000181', '00000000-0000-4000-8000-000000000182', '00000000-0000-4000-8000-000000000131', '00000000-0000-4000-8000-000000000121'),
  ('00000000-0000-4000-8000-000000000162', '00000000-0000-4000-8000-000000000181', '00000000-0000-4000-8000-000000000183', '00000000-0000-4000-8000-000000000131', '00000000-0000-4000-8000-000000000122');

insert into public.clinical_notes (encounter_id, organization_id, practice_id, body_ciphertext, created_by) values
  ('00000000-0000-4000-8000-000000000161', '00000000-0000-4000-8000-000000000181', '00000000-0000-4000-8000-000000000182', 'nota-samara', '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000000162', '00000000-0000-4000-8000-000000000181', '00000000-0000-4000-8000-000000000183', 'nota-thais', '00000000-0000-4000-8000-000000000102');

insert into public.exam_orders (id, organization_id, practice_id, patient_id, title, requested_by) values
  ('00000000-0000-4000-8000-000000000171', '00000000-0000-4000-8000-000000000181', '00000000-0000-4000-8000-000000000183', '00000000-0000-4000-8000-000000000131', 'Exame Thais', '00000000-0000-4000-8000-000000000122');

insert into public.break_glass_grants (
  user_id, patient_id, practice_id, reason, approved_by, starts_at, expires_at
) values (
  '00000000-0000-4000-8000-000000000105',
  '00000000-0000-4000-8000-000000000131',
  '00000000-0000-4000-8000-000000000183',
  'plantao',
  '00000000-0000-4000-8000-000000000104',
  now() - interval '1 minute',
  now() + interval '1 hour'
);

insert into public.pregnancies (
  id, organization_id, practice_id, patient_id, primary_professional_id, backup_professional_id
) values (
  '00000000-0000-4000-8000-000000000191',
  '00000000-0000-4000-8000-000000000181',
  '00000000-0000-4000-8000-000000000182',
  '00000000-0000-4000-8000-000000000131',
  '00000000-0000-4000-8000-000000000121',
  '00000000-0000-4000-8000-000000000123'
);

select public.casa_session_start(
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000101',
  now() + interval '1 hour'
);

do $$
declare
  n int;
  active uuid;
  unsafe boolean;
begin
  select public.casa_session_active('00000000-0000-4000-8000-000000000201') into active;
  if active is distinct from '00000000-0000-4000-8000-000000000101' then
    raise exception 'Sessão não abriu';
  end if;
  perform public.casa_session_revoke('00000000-0000-4000-8000-000000000201');
  select public.casa_session_active('00000000-0000-4000-8000-000000000201') into active;
  if active is not null then
    raise exception 'Logout não revogou a sessão';
  end if;
  perform public.casa_session_start(
    '00000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000101',
    now() + interval '1 hour'
  );
  perform public.casa_sessions_revoke_user('00000000-0000-4000-8000-000000000101');
  select public.casa_session_active('00000000-0000-4000-8000-000000000202') into active;
  if active is not null then
    raise exception 'Troca de senha não revogou a sessão';
  end if;

  execute 'set local role casa_login';
  select (rolsuper or rolbypassrls) into unsafe
  from pg_roles
  where rolname = current_user;
  if unsafe then
    raise exception 'casa_login é superusuário ou ignora RLS';
  end if;
  execute 'reset role';

  execute 'set local role authenticated';

  begin
    perform 1 from public.staff_credentials;
    raise exception 'authenticated leu staff_credentials';
  exception
    when insufficient_privilege then
      null;
  end;

  begin
    perform 1 from public.casa_sessions;
    raise exception 'authenticated leu casa_sessions';
  exception
    when insufficient_privilege then
      null;
  end;

  perform set_config('app.user_id', '00000000-0000-4000-8000-000000000105', true);
  if not public.can_read_clinical(
    '00000000-0000-4000-8000-000000000183',
    '00000000-0000-4000-8000-000000000131',
    null
  ) then
    raise exception 'Break-glass não leu a prática de Thais';
  end if;
  select count(*) into n from public.clinical_notes where practice_id = '00000000-0000-4000-8000-000000000183';
  if n <> 1 then raise exception 'Break-glass não leu a nota de Thais'; end if;
  select count(*) into n from public.clinical_notes where practice_id = '00000000-0000-4000-8000-000000000182';
  if n <> 0 then raise exception 'Break-glass leu a nota de Samara'; end if;

  perform set_config('app.user_id', '00000000-0000-4000-8000-000000000106', true);
  select count(*) into n from public.pregnancies where id = '00000000-0000-4000-8000-000000000191';
  if n <> 1 then raise exception 'Retaguarda nomeada não leu a gestação'; end if;
  select count(*) into n from public.clinical_notes;
  if n <> 0 then raise exception 'Retaguarda leu nota fora da gestação'; end if;

  perform set_config('app.user_id', '00000000-0000-4000-8000-000000000102', true);
  select count(*) into n from public.pregnancies where id = '00000000-0000-4000-8000-000000000191';
  if n <> 0 then raise exception 'Thais leu a gestação de Samara sem ser a retaguarda'; end if;

  perform set_config('app.user_id', '00000000-0000-4000-8000-000000000107', true);
  select count(*) into n from public.patient_clinical_data;
  if n <> 2 then raise exception 'Paciente não leu as próprias fichas'; end if;
  if not public.can_read_exam_file(
    '00000000-0000-4000-8000-000000000183',
    '00000000-0000-4000-8000-000000000131',
    '00000000-0000-4000-8000-000000000181'
  ) then
    raise exception 'Paciente não leu o próprio exame';
  end if;

  perform set_config('app.user_id', '00000000-0000-4000-8000-000000000103', true);
  select count(*) into n from public.patient_clinical_data;
  if n <> 0 then raise exception 'Secretária leu ficha'; end if;
  select count(*) into n from public.clinical_notes;
  if n <> 0 then raise exception 'Secretária leu nota'; end if;
  if public.can_read_exam_file(
    '00000000-0000-4000-8000-000000000183',
    '00000000-0000-4000-8000-000000000131',
    '00000000-0000-4000-8000-000000000181'
  ) then
    raise exception 'Secretária leu arquivo de exame';
  end if;

  perform set_config('app.user_id', '00000000-0000-4000-8000-000000000101', true);
  if public.can_read_exam_file(
    '00000000-0000-4000-8000-000000000183',
    '00000000-0000-4000-8000-000000000131',
    '00000000-0000-4000-8000-000000000181'
  ) then
    raise exception 'Samara leu exame de Thais';
  end if;
end $$;

rollback;
