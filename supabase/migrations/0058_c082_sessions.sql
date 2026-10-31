-- C082 — sessão revogável. Não guarda senha. Não cria usuário.
-- O cookie só vale enquanto esta linha existir. Logout e troca de senha apagam a linha.

create table if not exists public.casa_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table public.casa_sessions is
  'Sessão da casa. O cookie HMAC aponta para id. Some no logout e na troca de senha.';

alter table public.casa_sessions enable row level security;
revoke all on table public.casa_sessions from public;
revoke all on table public.casa_sessions from anon, authenticated;

create or replace function public.casa_session_start(
  p_id uuid,
  p_user_id uuid,
  p_expires_at timestamptz
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.casa_sessions (id, user_id, expires_at)
  values (p_id, p_user_id, p_expires_at);
$$;

create or replace function public.casa_session_active(p_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select user_id
  from public.casa_sessions
  where id = p_id
    and expires_at > now();
$$;

create or replace function public.casa_session_revoke(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.casa_sessions where id = p_id;
$$;

create or replace function public.casa_sessions_revoke_user(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.casa_sessions where user_id = p_user_id;
$$;

create or replace function public.casa_staff_hash(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select c.password_hash
  from public.staff_credentials c
  where c.user_id = p_user_id;
$$;

create or replace function public.casa_password_replace(p_user_id uuid, p_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_hash is null or p_hash not like '$argon2id$%' then
    raise exception 'Hash inválido.';
  end if;
  update public.staff_credentials
     set password_hash = p_hash,
         updated_at = now()
   where user_id = p_user_id;
  if not found then
    raise exception 'Credencial inexistente.';
  end if;
  delete from public.casa_sessions where user_id = p_user_id;
end;
$$;

revoke all on function public.casa_session_start(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.casa_session_active(uuid) from public, anon, authenticated;
revoke all on function public.casa_session_revoke(uuid) from public, anon, authenticated;
revoke all on function public.casa_sessions_revoke_user(uuid) from public, anon, authenticated;
revoke all on function public.casa_staff_hash(uuid) from public, anon, authenticated;
revoke all on function public.casa_password_replace(uuid, text) from public, anon, authenticated;

grant execute on function public.casa_session_start(uuid, uuid, timestamptz) to casa_app;
grant execute on function public.casa_session_active(uuid) to casa_app;
grant execute on function public.casa_session_revoke(uuid) to casa_app;
grant execute on function public.casa_sessions_revoke_user(uuid) to casa_app;
grant execute on function public.casa_staff_hash(uuid) to casa_app;
grant execute on function public.casa_password_replace(uuid, text) to casa_app;
