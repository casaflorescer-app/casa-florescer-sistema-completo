-- Permissões por usuário: módulos da sidebar/UI. NÃO autorizam SQL/RLS.

alter table public.profiles
  add column if not exists permissions jsonb not null default '[]'::jsonb;

comment on column public.profiles.permissions is
  'Módulos de interface (ex: ["agenda","pacientes","exames"]). Vazio = padrões do papel na aplicação. Nunca substitui RLS. Não pode conceder prontuário a quem o papel não permite.';

create or replace function public.profiles_permissions_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_roles public.app_role[];
  v_has_physician boolean;
begin
  if new.permissions is not distinct from old.permissions then
    return new;
  end if;

  select coalesce(array_agg(distinct r.role), '{}'::public.app_role[])
  into v_roles
  from public.user_practice_roles r
  where r.user_id = new.id;

  v_has_physician := 'physician' = any (v_roles);

  if new.permissions ? 'prontuario' and not v_has_physician then
    raise exception 'Módulo prontuario só pode ser atribuído a physician (DOCTOR).';
  end if;
  if new.permissions ? 'obstetrico' and not v_has_physician then
    raise exception 'Módulo obstetrico só pode ser atribuído a physician (DOCTOR).';
  end if;
  if new.permissions ? 'contratos' and not (v_roles && array['owner', 'admin']::public.app_role[]) then
    raise exception 'Módulo contratos só pode ser atribuído a OWNER ou ADMIN.';
  end if;
  if new.permissions ? 'permissoes' and not (v_roles && array['owner', 'admin']::public.app_role[]) then
    raise exception 'Módulo permissoes só pode ser atribuído a OWNER ou ADMIN.';
  end if;

  perform public.write_audit(
    'update',
    'profiles',
    new.id,
    null,
    null,
    jsonb_build_object('permissions', new.permissions, 'note', 'ui_modules_only')
  );

  return new;
end;
$$;

drop trigger if exists profiles_permissions_guard on public.profiles;
create trigger profiles_permissions_guard
  before update of permissions
  on public.profiles
  for each row execute function public.profiles_permissions_guard();
