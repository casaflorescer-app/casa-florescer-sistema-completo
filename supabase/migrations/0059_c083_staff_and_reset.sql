-- C083 — criação de staff só pelo administrador principal, e redefinição de senha.
-- Não cria organização, prática, usuário nem senha. Não grava o token em claro.

create table if not exists public.casa_password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check (char_length(token_hash) between 32 and 128),
  check (used_at is null or used_at >= created_at)
);

comment on table public.casa_password_resets is
  'Redefinição de senha. Guarda só o hash do token. Sem SMTP o Next não chama o registro.';

alter table public.casa_password_resets enable row level security;
revoke all on table public.casa_password_resets from public;
revoke all on table public.casa_password_resets from anon, authenticated;

create or replace function public.casa_password_reset_store(
  p_email text,
  p_token_hash text,
  p_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  if p_token_hash is null or char_length(p_token_hash) < 32 or char_length(p_token_hash) > 128 then
    raise exception 'Token inválido.';
  end if;
  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'Prazo inválido.';
  end if;

  select u.id into v_user
  from auth.users u
  where lower(u.email) = lower(trim(p_email));

  if v_user is null then
    return;
  end if;

  delete from public.casa_password_resets
  where user_id = v_user
    and used_at is null;

  insert into public.casa_password_resets (user_id, token_hash, expires_at)
  values (v_user, p_token_hash, p_expires_at);
end;
$$;

create or replace function public.casa_password_reset_finish(
  p_token_hash text,
  p_password_hash text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  if p_password_hash is null or p_password_hash not like '$argon2id$%' then
    raise exception 'Não foi possível redefinir a senha.';
  end if;

  select r.user_id into v_user
  from public.casa_password_resets r
  where r.token_hash = p_token_hash
    and r.used_at is null
    and r.expires_at > now();

  if v_user is null then
    raise exception 'Não foi possível redefinir a senha.';
  end if;

  update public.casa_password_resets
     set used_at = now()
   where token_hash = p_token_hash
     and used_at is null;

  perform public.casa_password_replace(v_user, p_password_hash);
end;
$$;

create or replace function public.casa_staff_create(
  p_email text,
  p_full_name text,
  p_password_hash text,
  p_organization uuid,
  p_memberships jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_email text;
  v_name text;
  v_row record;
  v_cashier boolean;
  v_schedule boolean;
begin
  if not public.is_system_admin() then
    raise exception 'Somente o administrador principal pode criar usuários.';
  end if;
  if p_password_hash is null or p_password_hash not like '$argon2id$%' then
    raise exception 'Hash inválido.';
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  v_name := trim(coalesce(p_full_name, ''));
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'E-mail inválido.';
  end if;
  if char_length(v_name) < 2 then
    raise exception 'Nome inválido.';
  end if;
  if not exists (select 1 from public.organizations o where o.id = p_organization) then
    raise exception 'Organização inexistente.';
  end if;
  if jsonb_typeof(coalesce(p_memberships, '[]'::jsonb)) is distinct from 'array'
     or jsonb_array_length(coalesce(p_memberships, '[]'::jsonb)) < 1 then
    raise exception 'Informe ao menos um papel.';
  end if;

  insert into auth.users (email)
  values (v_email)
  returning id into v_user;

  insert into public.profiles (id, organization_id, full_name, email)
  values (v_user, p_organization, v_name, v_email);

  insert into public.staff_credentials (user_id, password_hash)
  values (v_user, p_password_hash);

  for v_row in
    select *
    from jsonb_to_recordset(p_memberships) as m(
      practice_id uuid,
      role text,
      can_cashier boolean,
      can_schedule_any_practice boolean
    )
  loop
    if v_row.role is null or v_row.role not in ('admin', 'physician', 'secretary') then
      raise exception 'Papel não permitido nesta criação.';
    end if;
    if not exists (
      select 1
      from public.practice_units pu
      where pu.id = v_row.practice_id
        and pu.organization_id = p_organization
    ) then
      raise exception 'Prática fora da organização.';
    end if;

    v_cashier := false;
    v_schedule := false;
    if v_row.role = 'physician' then
      v_cashier := true;
    elsif v_row.role = 'secretary' then
      v_schedule := coalesce(v_row.can_schedule_any_practice, false);
    end if;

    insert into public.user_practice_roles (
      user_id,
      practice_id,
      role,
      clinical_access,
      can_cashier,
      can_schedule_any_practice
    ) values (
      v_user,
      v_row.practice_id,
      v_row.role::public.app_role,
      'none',
      v_cashier,
      v_schedule
    );
  end loop;

  return v_user;
end;
$$;

comment on function public.casa_staff_create(text, text, text, uuid, jsonb) is
  'Cria staff. Só SYSTEM_ADMIN. Não concede SYSTEM_ADMIN. Secretária e administradora não ficam com caixa. Médica fica com a caixa da própria prática. O trigger zera o prontuário de quem não é physician.';

revoke all on function public.casa_password_reset_store(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.casa_password_reset_finish(text, text) from public, anon, authenticated;
revoke all on function public.casa_staff_create(text, text, text, uuid, jsonb) from public, anon, authenticated;

grant execute on function public.casa_password_reset_store(text, text, timestamptz) to casa_app;
grant execute on function public.casa_password_reset_finish(text, text) to casa_app;
grant execute on function public.casa_staff_create(text, text, text, uuid, jsonb) to casa_app;
