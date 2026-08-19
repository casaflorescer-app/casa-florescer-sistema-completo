-- Permissões por usuário (módulos da sidebar), além do papel RBAC.

alter table public.profiles
  add column if not exists permissions jsonb not null default '[]'::jsonb;

comment on column public.profiles.permissions is
  'Módulos autorizados, ex: ["agenda","pacientes","exames"]. Vazio = padrões do papel.';

create policy profiles_self_read on public.profiles
  for select using (id = auth.uid());

create policy profiles_admin_read on public.profiles
  for select using (
    exists (
      select 1
      from public.user_practice_roles r
      where r.user_id = auth.uid()
        and r.role in ('owner', 'admin')
    )
  );

create policy profiles_admin_update on public.profiles
  for update using (
    exists (
      select 1
      from public.user_practice_roles r
      where r.user_id = auth.uid()
        and r.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.user_practice_roles r
      where r.user_id = auth.uid()
        and r.role in ('owner', 'admin')
    )
  );
