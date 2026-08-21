-- Admin Master: god mode no Postgres.
-- profiles.role = 'admin' (ou user_practice_roles admin/owner) passa em
-- SELECT/INSERT/UPDATE/DELETE de toda tabela já protegida por RLS.

alter table public.profiles
  add column if not exists role text;

alter table public.profiles
  drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role is null or role in ('admin', 'physician', 'secretary', 'patient'));

comment on column public.profiles.role is
  'Papel mestre da casa. admin = bypass total de RLS e de módulos no app.';

create or replace function public.is_master_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'admin'
        or exists (
          select 1
          from public.user_practice_roles r
          where r.user_id = p.id
            and r.role in ('admin', 'owner')
        )
      )
  )
$$;

revoke all on function public.is_master_admin() from public;
grant execute on function public.is_master_admin() to authenticated;

create or replace function public.is_org_clinical_staff(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_master_admin()
  or exists (
    select 1
    from public.profiles p
    join public.user_practice_roles r on r.user_id = p.id
    where p.id = auth.uid()
      and p.organization_id = p_org
      and r.role in ('owner', 'admin', 'secretary', 'physician')
  )
$$;

do $$
declare
  t text;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity
  loop
    execute format('drop policy if exists master_admin_all on public.%I', t);
    execute format(
      'create policy master_admin_all on public.%I for all using (public.is_master_admin()) with check (public.is_master_admin())',
      t
    );
  end loop;
end $$;
