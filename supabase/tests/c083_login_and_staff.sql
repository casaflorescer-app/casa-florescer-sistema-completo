-- C083 — criação de staff e redefinição. Transação desfeita. Sem pessoa real.
-- Roda como o superusuário do console e troca de papel no meio.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000301', 'c083-principal@example.com'),
  ('00000000-0000-4000-8000-000000000302', 'c083-administradora@example.com');

insert into public.organizations (id, legal_name, trade_name, cnpj) values (
  '00000000-0000-4000-8000-000000000381',
  'Organizacao Exemplo C083',
  'Exemplo C083',
  '00000000000083'
);

insert into public.practice_units (
  id, organization_id, kind, code, name, specialty, isolation_label
) values
  (
    '00000000-0000-4000-8000-000000000382',
    '00000000-0000-4000-8000-000000000381',
    'house', 'c083-a', 'Pratica A', 'ginecologia', 'Pratica A'
  ),
  (
    '00000000-0000-4000-8000-000000000383',
    '00000000-0000-4000-8000-000000000381',
    'house', 'c083-b', 'Pratica B', 'ginecologia', 'Pratica B'
  );

insert into public.profiles (id, organization_id, full_name, email) values
  (
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000381',
    'Principal Exemplo',
    'c083-principal@example.com'
  ),
  (
    '00000000-0000-4000-8000-000000000302',
    '00000000-0000-4000-8000-000000000381',
    'Administradora Exemplo',
    'c083-administradora@example.com'
  );

insert into public.system_admins (user_id, reason) values (
  '00000000-0000-4000-8000-000000000301',
  'prova c083'
);

insert into public.user_practice_roles (
  user_id, practice_id, role, clinical_access, can_cashier
) values (
  '00000000-0000-4000-8000-000000000302',
  '00000000-0000-4000-8000-000000000382',
  'admin',
  'none',
  false
);

insert into public.staff_credentials (user_id, password_hash) values (
  '00000000-0000-4000-8000-000000000301',
  '$argon2id$v=19$m=65536,p=4,t=3$c083c083c083c083c083c083$c083c083c083c083c083c083c083c083c083c08'
);

do $$
declare
  v_user uuid;
  v_access public.clinical_access;
  v_cashier boolean;
  v_schedule boolean;
  v_count integer;
  v_active uuid;
  v_hash text := '$argon2id$v=19$m=65536,p=4,t=3$c083c083c083c083c083c083$c083c083c083c083c083c083c083c083c083c08';
  v_memberships jsonb := '[
    {"practice_id":"00000000-0000-4000-8000-000000000382","role":"secretary","can_cashier":true,"can_schedule_any_practice":true},
    {"practice_id":"00000000-0000-4000-8000-000000000383","role":"secretary","can_cashier":true,"can_schedule_any_practice":true}
  ]'::jsonb;
begin
  execute 'set local role authenticated';
  begin
    perform public.casa_staff_create(
      'c083-secretaria@example.com',
      'Secretaria Exemplo',
      v_hash,
      '00000000-0000-4000-8000-000000000381',
      v_memberships
    );
    raise exception 'authenticated criou usuário';
  exception
    when insufficient_privilege then
      null;
  end;
  execute 'reset role';

  execute 'set local role casa_login';
  perform set_config('app.user_id', '00000000-0000-4000-8000-000000000302', true);
  begin
    perform public.casa_staff_create(
      'c083-secretaria@example.com',
      'Secretaria Exemplo',
      v_hash,
      '00000000-0000-4000-8000-000000000381',
      v_memberships
    );
    raise exception 'administradora criou usuário';
  exception
    when others then
      if sqlerrm not like '%administrador principal%' then
        raise;
      end if;
  end;

  perform set_config('app.user_id', '00000000-0000-4000-8000-000000000301', true);
  v_user := public.casa_staff_create(
    'c083-secretaria@example.com',
    'Secretaria Exemplo',
    v_hash,
    '00000000-0000-4000-8000-000000000381',
    v_memberships
  );
  execute 'reset role';

  select count(*) into v_count
  from public.user_practice_roles
  where user_id = v_user;
  if v_count <> 2 then
    raise exception 'Secretária não ficou nas duas práticas';
  end if;

  select clinical_access, can_cashier, can_schedule_any_practice
    into v_access, v_cashier, v_schedule
  from public.user_practice_roles
  where user_id = v_user
  limit 1;
  if v_access is distinct from 'none' or v_cashier or not v_schedule then
    raise exception 'Secretária recebeu caixa ou prontuário';
  end if;

  if exists (select 1 from public.system_admins where user_id = v_user) then
    raise exception 'Criação de staff concedeu administrador principal';
  end if;

  execute 'set local role casa_login';
  perform set_config('app.user_id', '00000000-0000-4000-8000-000000000301', true);
  v_user := public.casa_staff_create(
    'c083-medica@example.com',
    'Medica Exemplo',
    v_hash,
    '00000000-0000-4000-8000-000000000381',
    '[{"practice_id":"00000000-0000-4000-8000-000000000382","role":"physician","can_cashier":false}]'::jsonb
  );
  perform public.casa_staff_create(
    'c083-financeira@example.com',
    'Financeira Exemplo',
    v_hash,
    '00000000-0000-4000-8000-000000000381',
    '[
      {"practice_id":"00000000-0000-4000-8000-000000000382","role":"admin","can_cashier":true},
      {"practice_id":"00000000-0000-4000-8000-000000000383","role":"admin","can_cashier":true}
    ]'::jsonb
  );
  execute 'reset role';

  select clinical_access, can_cashier into v_access, v_cashier
  from public.user_practice_roles
  where user_id = v_user;
  if v_access is distinct from 'practice' or not v_cashier then
    raise exception 'Médica ficou sem a própria prática ou sem a própria caixa';
  end if;

  select bool_or(can_cashier) or bool_or(clinical_access is distinct from 'none')
    into v_cashier
  from public.user_practice_roles r
  join public.profiles p on p.id = r.user_id
  where p.email = 'c083-financeira@example.com';
  if v_cashier then
    raise exception 'Administradora ficou com caixa ou prontuário';
  end if;

  execute 'set local role casa_login';
  perform public.casa_password_reset_store(
    'nao-existe-c083@example.com',
    'c083hashc083hashc083hashc083hashc083',
    now() + interval '30 minutes'
  );
  execute 'reset role';
  select count(*) into v_count from public.casa_password_resets;
  if v_count <> 0 then
    raise exception 'E-mail ausente gerou token';
  end if;

  execute 'set local role casa_login';
  perform public.casa_session_start(
    '00000000-0000-4000-8000-000000000391',
    '00000000-0000-4000-8000-000000000301',
    now() + interval '1 hour'
  );
  perform public.casa_password_reset_store(
    'c083-principal@example.com',
    'c083hashc083hashc083hashc083hashc083',
    now() + interval '30 minutes'
  );
  perform public.casa_password_reset_finish(
    'c083hashc083hashc083hashc083hashc083',
    v_hash
  );
  select public.casa_session_active('00000000-0000-4000-8000-000000000391') into v_active;
  if v_active is not null then
    raise exception 'Redefinição não revogou a sessão';
  end if;
  execute 'reset role';

  execute 'set local role authenticated';
  begin
    perform 1 from public.casa_password_resets;
    raise exception 'authenticated leu o token de redefinição';
  exception
    when insufficient_privilege then
      null;
  end;
  execute 'reset role';
end $$;

rollback;
