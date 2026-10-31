-- C076 — prelúdio para o PostgreSQL BancoFlorescerPP, sem GoTrue, PostgREST nem Storage API.
-- Não altera 0001–0055. Roda antes delas, pelo nome do arquivo.
-- Não aplicar sem autorização. Não cria organização, prática, usuário nem senha.
--
-- CREATE ROLE não entra em transação nem em função. Os papéis nascem em
-- scripts/c076-roles.sql, fora de transação, antes deste arquivo.
-- deploy/apply-migrations.sh aponta para o container supabase-db. Não use esse
-- script neste banco. Não aplicar sem autorização.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_roles where rolname = 'authenticated')
     or not exists (select 1 from pg_roles where rolname = 'service_role')
     or not exists (select 1 from pg_roles where rolname = 'casa_app') then
    raise exception 'C076: aplique scripts/c076-roles.sql fora de transação antes deste arquivo';
  end if;
end $$;

comment on role casa_app is
  'Conexão da aplicação. Sem superusuário e sem BYPASSRLS. O processo faz SET ROLE authenticated depois de app.user_id.';

grant authenticated to casa_app;
grant anon to casa_app;

revoke casa_app from service_role;
revoke service_role from casa_app;

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;

create extension if not exists citext;
create extension if not exists btree_gist;
create extension if not exists pgcrypto with schema extensions;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz not null default now(),
  constraint auth_users_email_unique unique (email)
);

comment on table auth.users is
  'Identidade local. Não é o GoTrue. A senha não fica nesta tabela.';

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

comment on function auth.uid() is
  'Usuário da transação. O Next grava app.user_id com SET LOCAL. Sem JWT.';

revoke all on function auth.uid() from public;
grant usage on schema auth to authenticated, casa_app;
grant execute on function auth.uid() to authenticated, casa_app;

create table if not exists public.staff_credentials (
  user_id uuid primary key references auth.users (id) on delete restrict,
  password_hash text not null,
  updated_at timestamptz not null default now(),
  constraint staff_credentials_argon2id check (password_hash like '$argon2id$%')
);

comment on table public.staff_credentials is
  'Hash Argon2id da senha de staff. O browser não lê esta tabela.';

alter table public.staff_credentials enable row level security;
revoke all on public.staff_credentials from public;
revoke all on public.staff_credentials from anon, authenticated;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata jsonb,
  version text,
  owner_id text
);

alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;

grant usage on schema storage to authenticated;
grant select on storage.buckets to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;

grant usage on schema extensions to authenticated, casa_app;
