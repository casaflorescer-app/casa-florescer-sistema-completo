-- Casa Florescer — fotografia cadastral da paciente (MPI).
-- Bucket privado patient-photos. Não reutiliza exam_uploads.
-- SYSTEM_ADMIN NÃO entra em can_access_patient_photo: a foto segue o acesso
-- clínico da paciente (casa / médico vinculado / created_by / patient self),
-- não o FOR ALL da policy patients_system_admin.

alter table public.patients
  add column if not exists photo_path text;

comment on column public.patients.photo_path is
  'Caminho no bucket privado patient-photos. NULL = sem fotografia. Não armazenar bytes nem URL pública.';

-- ---------------------------------------------------------------------------
-- Bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'patient-photos',
  'patient-photos',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Path canônico: {organization_id}/{patient_id}/photo
-- ---------------------------------------------------------------------------

create or replace function public.patient_photo_path_ids(object_name text)
returns table (organization_id uuid, patient_id uuid)
language plpgsql
stable
set search_path = public
as $$
declare
  parts text[];
begin
  parts := string_to_array(object_name, '/');
  if array_length(parts, 1) is distinct from 3 then
    return;
  end if;
  if parts[3] is distinct from 'photo' then
    return;
  end if;
  if parts[1] is null or parts[2] is null then
    return;
  end if;
  if parts[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return;
  end if;
  if parts[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return;
  end if;
  organization_id := parts[1]::uuid;
  patient_id := parts[2]::uuid;
  return next;
end;
$$;

comment on function public.patient_photo_path_ids(text) is
  'Extrai organization_id e patient_id do objeto {org}/{patient}/photo. Rejeita path arbitrário.';

-- ---------------------------------------------------------------------------
-- Autorização da fotografia (espelha SELECT clínico de patients, sem SYSTEM_ADMIN)
-- ---------------------------------------------------------------------------

create or replace function public.can_access_patient_photo(p_patient uuid, p_organization uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.patients p
    where p.id = p_patient
      and p.organization_id = p_organization
      and (
        public.is_house_staff(
          p.organization_id,
          array['owner', 'admin', 'secretary', 'physician']::public.app_role[]
        )
        or exists (
          select 1
          from public.patient_practice_links l
          where l.patient_id = p.id
            and public.has_practice_role(l.practice_id, array['physician']::public.app_role[])
        )
        or p.created_by = auth.uid()
        or public.is_patient_self(p.id)
      )
  )
$$;

comment on function public.can_access_patient_photo(uuid, uuid) is
  'Leitura da foto: house staff, médico vinculado, created_by ou a própria paciente. Sem SYSTEM_ADMIN.';

create or replace function public.can_manage_patient_photo(p_patient uuid, p_organization uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.patients p
    where p.id = p_patient
      and p.organization_id = p_organization
      and (
        public.is_house_staff(
          p.organization_id,
          array['owner', 'admin', 'secretary', 'physician']::public.app_role[]
        )
        or exists (
          select 1
          from public.patient_practice_links l
          where l.patient_id = p.id
            and public.has_practice_role(l.practice_id, array['physician']::public.app_role[])
        )
      )
  )
$$;

comment on function public.can_manage_patient_photo(uuid, uuid) is
  'Alterar/remover foto: mesmo critério de patients_staff_update, sem SYSTEM_ADMIN.';

revoke all on function public.patient_photo_path_ids(text) from public;
revoke all on function public.can_access_patient_photo(uuid, uuid) from public;
revoke all on function public.can_manage_patient_photo(uuid, uuid) from public;

grant execute on function public.patient_photo_path_ids(text) to authenticated;
grant execute on function public.can_access_patient_photo(uuid, uuid) to authenticated;
grant execute on function public.can_manage_patient_photo(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Policies de storage.objects (independentes do RLS de patients)
-- ---------------------------------------------------------------------------

drop policy if exists patient_photos_select on storage.objects;
create policy patient_photos_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'patient-photos'
    and exists (
      select 1
      from public.patient_photo_path_ids(name) ids
      where public.can_access_patient_photo(ids.patient_id, ids.organization_id)
    )
  );

drop policy if exists patient_photos_insert on storage.objects;
create policy patient_photos_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'patient-photos'
    and exists (
      select 1
      from public.patient_photo_path_ids(name) ids
      where public.can_manage_patient_photo(ids.patient_id, ids.organization_id)
    )
  );

drop policy if exists patient_photos_update on storage.objects;
create policy patient_photos_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'patient-photos'
    and exists (
      select 1
      from public.patient_photo_path_ids(name) ids
      where public.can_manage_patient_photo(ids.patient_id, ids.organization_id)
    )
  )
  with check (
    bucket_id = 'patient-photos'
    and exists (
      select 1
      from public.patient_photo_path_ids(name) ids
      where public.can_manage_patient_photo(ids.patient_id, ids.organization_id)
    )
  );

drop policy if exists patient_photos_delete on storage.objects;
create policy patient_photos_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'patient-photos'
    and exists (
      select 1
      from public.patient_photo_path_ids(name) ids
      where public.can_manage_patient_photo(ids.patient_id, ids.organization_id)
    )
  );
