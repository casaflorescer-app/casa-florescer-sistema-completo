-- C032.4 — Orientações clínicas à paciente (áudio + transcrição + publicação)
-- Separado de SOAP / clinical_notes / Central de Relacionamentos.
-- Paciente só lê versões published. Secretária/owner/admin NÃO leem conteúdo clínico.
-- Bucket privado clinical-orientations. Sem WhatsApp / Web Push nesta etapa.

-- ---------------------------------------------------------------------------
-- 1) Tabelas
-- ---------------------------------------------------------------------------

create table if not exists public.clinical_orientations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  patient_id uuid not null references public.patients (id),
  professional_id uuid not null references public.professionals (id),
  encounter_id uuid references public.encounters (id),
  appointment_id uuid references public.appointments (id),
  title text not null default 'Orientação clínica',
  current_published_version_id uuid,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clinical_orientations_patient_idx
  on public.clinical_orientations (patient_id, created_at desc);
create index if not exists clinical_orientations_practice_idx
  on public.clinical_orientations (practice_id, created_at desc);
create index if not exists clinical_orientations_encounter_idx
  on public.clinical_orientations (encounter_id)
  where encounter_id is not null;

comment on table public.clinical_orientations is
  'Orientação clínica dirigida à paciente. Não substitui SOAP/clinical_notes. Sem marketing/WhatsApp.';

create table if not exists public.clinical_orientation_versions (
  id uuid primary key default gen_random_uuid(),
  orientation_id uuid not null references public.clinical_orientations (id) on delete cascade,
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  patient_id uuid not null references public.patients (id),
  professional_id uuid not null references public.professionals (id),
  version integer not null check (version >= 1),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'superseded', 'archived')),
  audio_storage_path text,
  audio_mime_type text,
  audio_duration_seconds numeric(10, 2),
  transcription_status text not null default 'pending'
    check (transcription_status in ('pending', 'processing', 'completed', 'failed', 'skipped')),
  transcription_text text,
  transcription_error text,
  final_text text,
  delivery_mode text
    check (delivery_mode is null or delivery_mode in ('TEXT_ONLY', 'TEXT_AND_AUDIO')),
  reviewed_confirmed boolean not null default false,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  published_by uuid references public.profiles (id),
  viewed_at timestamptz,
  audio_played_at timestamptz,
  unique (orientation_id, version),
  check (
    status <> 'published'
    or (
      final_text is not null
      and btrim(final_text) <> ''
      and delivery_mode is not null
      and reviewed_confirmed = true
      and published_at is not null
      and published_by is not null
    )
  ),
  check (
    delivery_mode is distinct from 'TEXT_AND_AUDIO'
    or audio_storage_path is not null
  )
);

create index if not exists clinical_orientation_versions_orientation_idx
  on public.clinical_orientation_versions (orientation_id, version desc);
create index if not exists clinical_orientation_versions_patient_published_idx
  on public.clinical_orientation_versions (patient_id, published_at desc)
  where status = 'published';

comment on table public.clinical_orientation_versions is
  'Versões imutáveis após publish. Transcrição automática = rascunho. Paciente só lê published.';

alter table public.clinical_orientations
  drop constraint if exists clinical_orientations_current_published_fk;
alter table public.clinical_orientations
  add constraint clinical_orientations_current_published_fk
  foreign key (current_published_version_id)
  references public.clinical_orientation_versions (id)
  on delete set null;

create table if not exists public.patient_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid references public.practice_units (id),
  patient_id uuid not null references public.patients (id),
  recipient_user_id uuid not null references auth.users (id),
  event_type text not null,
  title text not null,
  message text not null,
  reference_type text,
  reference_id uuid,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists patient_notifications_recipient_idx
  on public.patient_notifications (recipient_user_id, created_at desc);
create index if not exists patient_notifications_patient_idx
  on public.patient_notifications (patient_id, created_at desc);

comment on table public.patient_notifications is
  'Notificações in-app da paciente. Sem conteúdo clínico no body. Preparação para push/WhatsApp futuros.';

-- ---------------------------------------------------------------------------
-- 2) Storage bucket privado
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clinical-orientations',
  'clinical-orientations',
  false,
  26214400,
  array[
    'audio/webm',
    'audio/ogg',
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/x-wav',
    'audio/mp3'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path: {organization_id}/{patient_id}/{orientation_id}/{version_id}/audio
create or replace function public.clinical_orientation_audio_path_ids(object_name text)
returns table (
  organization_id uuid,
  patient_id uuid,
  orientation_id uuid,
  version_id uuid
)
language plpgsql
stable
set search_path = public
as $$
declare
  parts text[];
begin
  parts := string_to_array(object_name, '/');
  if array_length(parts, 1) is distinct from 5 then
    return;
  end if;
  if parts[5] is distinct from 'audio' then
    return;
  end if;
  if parts[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return;
  end if;
  if parts[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return;
  end if;
  if parts[3] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return;
  end if;
  if parts[4] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return;
  end if;
  organization_id := parts[1]::uuid;
  patient_id := parts[2]::uuid;
  orientation_id := parts[3]::uuid;
  version_id := parts[4]::uuid;
  return next;
end;
$$;

create or replace function public.can_access_clinical_orientation_audio(p_patient uuid, p_organization uuid)
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
        public.is_patient_self(p.id)
        or exists (
          select 1
          from public.patient_practice_links l
          where l.patient_id = p.id
            and public.can_write_clinical(l.practice_id)
        )
        or exists (
          select 1
          from public.clinical_orientations o
          where o.patient_id = p.id
            and o.organization_id = p_organization
            and public.can_read_clinical(o.practice_id, o.patient_id, o.professional_id)
        )
      )
  )
$$;

revoke all on function public.clinical_orientation_audio_path_ids(text) from public;
revoke all on function public.can_access_clinical_orientation_audio(uuid, uuid) from public;
grant execute on function public.clinical_orientation_audio_path_ids(text) to authenticated;
grant execute on function public.can_access_clinical_orientation_audio(uuid, uuid) to authenticated;

drop policy if exists clinical_orientations_audio_select on storage.objects;
create policy clinical_orientations_audio_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'clinical-orientations'
    and exists (
      select 1
      from public.clinical_orientation_audio_path_ids(name) ids
      join public.clinical_orientation_versions v on v.id = ids.version_id
      where v.patient_id = ids.patient_id
        and v.organization_id = ids.organization_id
        and (
          (
            public.can_write_clinical(v.practice_id)
            and public.can_read_clinical(v.practice_id, v.patient_id, v.professional_id)
          )
          or (
            public.is_patient_self(v.patient_id)
            and v.status = 'published'
            and v.delivery_mode = 'TEXT_AND_AUDIO'
          )
        )
    )
  );

drop policy if exists clinical_orientations_audio_insert on storage.objects;
create policy clinical_orientations_audio_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'clinical-orientations'
    and exists (
      select 1
      from public.clinical_orientation_audio_path_ids(name) ids
      join public.clinical_orientation_versions v on v.id = ids.version_id
      where ids.organization_id = ids.organization_id
        and v.patient_id = ids.patient_id
        and v.orientation_id = ids.orientation_id
        and v.status = 'draft'
        and public.can_write_clinical(v.practice_id)
        and public.can_read_clinical(v.practice_id, v.patient_id, v.professional_id)
    )
  );

drop policy if exists clinical_orientations_audio_update on storage.objects;
create policy clinical_orientations_audio_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'clinical-orientations'
    and exists (
      select 1
      from public.clinical_orientation_audio_path_ids(name) ids
      join public.clinical_orientation_versions v on v.id = ids.version_id
      where v.status = 'draft'
        and public.can_write_clinical(v.practice_id)
    )
  )
  with check (
    bucket_id = 'clinical-orientations'
    and exists (
      select 1
      from public.clinical_orientation_audio_path_ids(name) ids
      join public.clinical_orientation_versions v on v.id = ids.version_id
      where v.status = 'draft'
        and public.can_write_clinical(v.practice_id)
    )
  );

-- Paciente só baixa áudio se versão publicada TEXT_AND_AUDIO (reforço na app via signed URL + RPC).
-- Storage SELECT acima permite self; a UI/RPC filtra delivery_mode.

-- ---------------------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------------------

revoke all on table public.clinical_orientations from public, anon, authenticated;
revoke all on table public.clinical_orientation_versions from public, anon, authenticated;
revoke all on table public.patient_notifications from public, anon, authenticated;

grant select on table public.clinical_orientations to authenticated;
grant select on table public.clinical_orientation_versions to authenticated;
grant select on table public.patient_notifications to authenticated;

alter table public.clinical_orientations enable row level security;
alter table public.clinical_orientation_versions enable row level security;
alter table public.patient_notifications enable row level security;

-- Médica: lê cabeçalhos se can_read_clinical.
drop policy if exists clinical_orientations_physician_select on public.clinical_orientations;
create policy clinical_orientations_physician_select on public.clinical_orientations
  for select to authenticated
  using (
    public.can_read_clinical(practice_id, patient_id, professional_id)
  );

-- Paciente: vê cabeçalho somente se houver versão publicada atual.
drop policy if exists clinical_orientations_patient_select on public.clinical_orientations;
create policy clinical_orientations_patient_select on public.clinical_orientations
  for select to authenticated
  using (
    public.is_patient_self(patient_id)
    and current_published_version_id is not null
  );

-- Versões: médica lê todas as suas versões clínicas.
drop policy if exists clinical_orientation_versions_physician_select on public.clinical_orientation_versions;
create policy clinical_orientation_versions_physician_select on public.clinical_orientation_versions
  for select to authenticated
  using (
    public.can_read_clinical(practice_id, patient_id, professional_id)
  );

-- Paciente: só published (final_text). Transcrição automática ainda fica na linha,
-- mas a app paciente não a seleciona; policy permite a linha published.
drop policy if exists clinical_orientation_versions_patient_select on public.clinical_orientation_versions;
create policy clinical_orientation_versions_patient_select on public.clinical_orientation_versions
  for select to authenticated
  using (
    public.is_patient_self(patient_id)
    and status = 'published'
  );

-- Notificações paciente: só o destinatário.
drop policy if exists patient_notifications_recipient_select on public.patient_notifications;
create policy patient_notifications_recipient_select on public.patient_notifications
  for select to authenticated
  using (recipient_user_id = auth.uid());

-- Sem INSERT/UPDATE/DELETE direto — RPCs SECURITY DEFINER.

-- ---------------------------------------------------------------------------
-- 4) Helper: notificar paciente
-- ---------------------------------------------------------------------------

create or replace function public.clinical_orientation_notify_patient(
  p_organization_id uuid,
  p_practice_id uuid,
  p_patient_id uuid,
  p_orientation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  select pa.user_id into v_user
  from public.patient_accounts pa
  where pa.patient_id = p_patient_id;

  if v_user is null then
    return;
  end if;

  insert into public.patient_notifications (
    organization_id,
    practice_id,
    patient_id,
    recipient_user_id,
    event_type,
    title,
    message,
    reference_type,
    reference_id
  ) values (
    p_organization_id,
    p_practice_id,
    p_patient_id,
    v_user,
    'clinical_orientation_published',
    'Nova orientação médica',
    'Você recebeu uma nova orientação da sua médica.',
    'clinical_orientation',
    p_orientation_id
  );
end;
$$;

revoke all on function public.clinical_orientation_notify_patient(uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) RPC: criar orientação + versão draft
-- ---------------------------------------------------------------------------

create or replace function public.clinical_orientation_create(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_practice uuid;
  v_patient uuid;
  v_professional uuid;
  v_encounter uuid;
  v_appointment uuid;
  v_title text;
  v_orientation public.clinical_orientations%rowtype;
  v_version public.clinical_orientation_versions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active) then
    raise exception 'PROFILE_INACTIVE';
  end if;

  begin
    v_org := (p_payload->>'organization_id')::uuid;
    v_practice := (p_payload->>'practice_id')::uuid;
    v_patient := (p_payload->>'patient_id')::uuid;
    v_professional := (p_payload->>'professional_id')::uuid;
    v_encounter := nullif(p_payload->>'encounter_id', '')::uuid;
    v_appointment := nullif(p_payload->>'appointment_id', '')::uuid;
  exception when others then
    raise exception 'ORIENTATION_INVALID';
  end;

  v_title := coalesce(nullif(btrim(coalesce(p_payload->>'title', '')), ''), 'Orientação clínica');

  if v_org is null or v_practice is null or v_patient is null or v_professional is null then
    raise exception 'ORIENTATION_INVALID';
  end if;

  if not public.can_write_clinical(v_practice) then
    raise exception 'FORBIDDEN';
  end if;

  if not public.can_read_clinical(v_practice, v_patient, v_professional) then
    raise exception 'FORBIDDEN';
  end if;

  if not exists (
    select 1 from public.professionals pr
    where pr.id = v_professional
      and pr.practice_id = v_practice
      and pr.organization_id = v_org
      and pr.profile_id = auth.uid()
  ) then
    raise exception 'PROFESSIONAL_MISMATCH';
  end if;

  if not exists (
    select 1 from public.patients p
    where p.id = v_patient and p.organization_id = v_org
  ) then
    raise exception 'PATIENT_INVALID';
  end if;

  if v_encounter is not null then
    if not exists (
      select 1 from public.encounters e
      where e.id = v_encounter
        and e.patient_id = v_patient
        and e.practice_id = v_practice
        and e.organization_id = v_org
    ) then
      raise exception 'ENCOUNTER_INVALID';
    end if;
  end if;

  insert into public.clinical_orientations (
    organization_id, practice_id, patient_id, professional_id,
    encounter_id, appointment_id, title, created_by
  ) values (
    v_org, v_practice, v_patient, v_professional,
    v_encounter, v_appointment, v_title, auth.uid()
  )
  returning * into v_orientation;

  insert into public.clinical_orientation_versions (
    orientation_id, organization_id, practice_id, patient_id, professional_id,
    version, status, transcription_status, created_by
  ) values (
    v_orientation.id, v_org, v_practice, v_patient, v_professional,
    1, 'draft', 'pending', auth.uid()
  )
  returning * into v_version;

  perform public.write_audit(
    'insert'::public.audit_action,
    'clinical_orientations',
    v_orientation.id,
    v_practice,
    v_patient,
    jsonb_build_object(
      'rpc', 'clinical_orientation_create',
      'event', 'ORIENTATION_CREATED',
      'version_id', v_version.id
    )
  );

  return jsonb_build_object(
    'orientation', to_jsonb(v_orientation),
    'version', to_jsonb(v_version)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) RPC: salvar rascunho / áudio / transcrição / texto
-- ---------------------------------------------------------------------------

create or replace function public.clinical_orientation_save_draft(p_payload jsonb)
returns public.clinical_orientation_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version_id uuid;
  v_row public.clinical_orientation_versions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  begin
    v_version_id := (p_payload->>'version_id')::uuid;
  exception when others then
    raise exception 'ORIENTATION_INVALID';
  end;

  select * into v_row
  from public.clinical_orientation_versions
  where id = v_version_id
  for update;

  if not found then
    raise exception 'ORIENTATION_NOT_FOUND';
  end if;

  if v_row.status <> 'draft' then
    raise exception 'ORIENTATION_NOT_DRAFT';
  end if;

  if not public.can_write_clinical(v_row.practice_id) then
    raise exception 'FORBIDDEN';
  end if;

  if not public.can_read_clinical(v_row.practice_id, v_row.patient_id, v_row.professional_id) then
    raise exception 'FORBIDDEN';
  end if;

  update public.clinical_orientation_versions
     set audio_storage_path = coalesce(nullif(p_payload->>'audio_storage_path', ''), audio_storage_path),
         audio_mime_type = coalesce(nullif(p_payload->>'audio_mime_type', ''), audio_mime_type),
         audio_duration_seconds = coalesce(
           nullif(p_payload->>'audio_duration_seconds', '')::numeric,
           audio_duration_seconds
         ),
         transcription_status = coalesce(
           nullif(p_payload->>'transcription_status', ''),
           transcription_status
         ),
         transcription_text = case
           when p_payload ? 'transcription_text' then nullif(p_payload->>'transcription_text', '')
           else transcription_text
         end,
         transcription_error = case
           when p_payload ? 'transcription_error' then nullif(p_payload->>'transcription_error', '')
           else transcription_error
         end,
         final_text = case
           when p_payload ? 'final_text' then nullif(p_payload->>'final_text', '')
           else final_text
         end,
         delivery_mode = case
           when p_payload ? 'delivery_mode' then nullif(p_payload->>'delivery_mode', '')
           else delivery_mode
         end,
         reviewed_confirmed = coalesce(
           (p_payload->>'reviewed_confirmed')::boolean,
           reviewed_confirmed
         )
   where id = v_version_id
  returning * into v_row;

  update public.clinical_orientations
     set updated_at = now()
   where id = v_row.orientation_id;

  perform public.write_audit(
    'update'::public.audit_action,
    'clinical_orientation_versions',
    v_row.id,
    v_row.practice_id,
    v_row.patient_id,
    jsonb_build_object(
      'rpc', 'clinical_orientation_save_draft',
      'event', 'ORIENTATION_EDITED',
      'transcription_status', v_row.transcription_status
    )
  );

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) RPC: publicar
-- ---------------------------------------------------------------------------

create or replace function public.clinical_orientation_publish(p_version_id uuid)
returns public.clinical_orientation_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.clinical_orientation_versions%rowtype;
  v_prev uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_row
  from public.clinical_orientation_versions
  where id = p_version_id
  for update;

  if not found then
    raise exception 'ORIENTATION_NOT_FOUND';
  end if;

  if v_row.status <> 'draft' then
    raise exception 'ORIENTATION_NOT_DRAFT';
  end if;

  if not public.can_write_clinical(v_row.practice_id) then
    raise exception 'FORBIDDEN';
  end if;

  if not public.can_read_clinical(v_row.practice_id, v_row.patient_id, v_row.professional_id) then
    raise exception 'FORBIDDEN';
  end if;

  if v_row.reviewed_confirmed is not true then
    raise exception 'ORIENTATION_NOT_REVIEWED';
  end if;

  if v_row.final_text is null or btrim(v_row.final_text) = '' then
    raise exception 'ORIENTATION_TEXT_REQUIRED';
  end if;

  if v_row.delivery_mode is null then
    raise exception 'ORIENTATION_DELIVERY_REQUIRED';
  end if;

  if v_row.delivery_mode = 'TEXT_AND_AUDIO' and v_row.audio_storage_path is null then
    raise exception 'ORIENTATION_AUDIO_REQUIRED';
  end if;

  select current_published_version_id into v_prev
  from public.clinical_orientations
  where id = v_row.orientation_id
  for update;

  if v_prev is not null then
    update public.clinical_orientation_versions
       set status = 'superseded'
     where id = v_prev
       and status = 'published';
  end if;

  update public.clinical_orientation_versions
     set status = 'published',
         published_at = now(),
         published_by = auth.uid()
   where id = p_version_id
  returning * into v_row;

  update public.clinical_orientations
     set current_published_version_id = v_row.id,
         updated_at = now()
   where id = v_row.orientation_id;

  perform public.clinical_orientation_notify_patient(
    v_row.organization_id,
    v_row.practice_id,
    v_row.patient_id,
    v_row.orientation_id
  );

  perform public.write_audit(
    'sign'::public.audit_action,
    'clinical_orientation_versions',
    v_row.id,
    v_row.practice_id,
    v_row.patient_id,
    jsonb_build_object(
      'rpc', 'clinical_orientation_publish',
      'event', 'ORIENTATION_PUBLISHED',
      'delivery_mode', v_row.delivery_mode,
      'version', v_row.version
    )
  );

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) RPC: nova versão draft a partir da atual
-- ---------------------------------------------------------------------------

create or replace function public.clinical_orientation_new_version(p_orientation_id uuid)
returns public.clinical_orientation_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o public.clinical_orientations%rowtype;
  v_next integer;
  v_row public.clinical_orientation_versions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_o
  from public.clinical_orientations
  where id = p_orientation_id
  for update;

  if not found then
    raise exception 'ORIENTATION_NOT_FOUND';
  end if;

  if not public.can_write_clinical(v_o.practice_id) then
    raise exception 'FORBIDDEN';
  end if;

  if not public.can_read_clinical(v_o.practice_id, v_o.patient_id, v_o.professional_id) then
    raise exception 'FORBIDDEN';
  end if;

  if exists (
    select 1 from public.clinical_orientation_versions
    where orientation_id = p_orientation_id and status = 'draft'
  ) then
    raise exception 'ORIENTATION_DRAFT_EXISTS';
  end if;

  select coalesce(max(version), 0) + 1 into v_next
  from public.clinical_orientation_versions
  where orientation_id = p_orientation_id;

  insert into public.clinical_orientation_versions (
    orientation_id, organization_id, practice_id, patient_id, professional_id,
    version, status, transcription_status, created_by
  ) values (
    v_o.id, v_o.organization_id, v_o.practice_id, v_o.patient_id, v_o.professional_id,
    v_next, 'draft', 'pending', auth.uid()
  )
  returning * into v_row;

  perform public.write_audit(
    'insert'::public.audit_action,
    'clinical_orientation_versions',
    v_row.id,
    v_o.practice_id,
    v_o.patient_id,
    jsonb_build_object(
      'rpc', 'clinical_orientation_new_version',
      'event', 'ORIENTATION_VERSION_CREATED',
      'version', v_row.version
    )
  );

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9) RPC: paciente marca visualização / áudio
-- ---------------------------------------------------------------------------

create or replace function public.clinical_orientation_mark_viewed(p_version_id uuid)
returns public.clinical_orientation_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.clinical_orientation_versions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_row
  from public.clinical_orientation_versions
  where id = p_version_id
  for update;

  if not found then
    raise exception 'ORIENTATION_NOT_FOUND';
  end if;

  if v_row.status <> 'published' then
    raise exception 'ORIENTATION_NOT_PUBLISHED';
  end if;

  if not public.is_patient_self(v_row.patient_id) then
    raise exception 'FORBIDDEN';
  end if;

  if v_row.viewed_at is null then
    update public.clinical_orientation_versions
       set viewed_at = now()
     where id = p_version_id
    returning * into v_row;

    perform public.write_audit(
      'read'::public.audit_action,
      'clinical_orientation_versions',
      v_row.id,
      v_row.practice_id,
      v_row.patient_id,
      jsonb_build_object('rpc', 'clinical_orientation_mark_viewed', 'event', 'ORIENTATION_VIEWED')
    );
  end if;

  return v_row;
end;
$$;

create or replace function public.clinical_orientation_mark_audio_played(p_version_id uuid)
returns public.clinical_orientation_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.clinical_orientation_versions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_row
  from public.clinical_orientation_versions
  where id = p_version_id
  for update;

  if not found then
    raise exception 'ORIENTATION_NOT_FOUND';
  end if;

  if v_row.status <> 'published' then
    raise exception 'ORIENTATION_NOT_PUBLISHED';
  end if;

  if v_row.delivery_mode <> 'TEXT_AND_AUDIO' then
    raise exception 'ORIENTATION_AUDIO_NOT_AVAILABLE';
  end if;

  if not public.is_patient_self(v_row.patient_id) then
    raise exception 'FORBIDDEN';
  end if;

  if v_row.audio_played_at is null then
    update public.clinical_orientation_versions
       set audio_played_at = now(),
           viewed_at = coalesce(viewed_at, now())
     where id = p_version_id
    returning * into v_row;

    perform public.write_audit(
      'read'::public.audit_action,
      'clinical_orientation_versions',
      v_row.id,
      v_row.practice_id,
      v_row.patient_id,
      jsonb_build_object('rpc', 'clinical_orientation_mark_audio_played', 'event', 'ORIENTATION_AUDIO_PLAYED')
    );
  end if;

  return v_row;
end;
$$;

create or replace function public.patient_notification_dismiss(p_notification_id uuid)
returns public.patient_notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.patient_notifications%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  update public.patient_notifications
     set dismissed_at = coalesce(dismissed_at, now()),
         read_at = coalesce(read_at, now())
   where id = p_notification_id
     and recipient_user_id = auth.uid()
  returning * into v_row;

  if not found then
    raise exception 'NOTIFICATION_NOT_FOUND';
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10) Grants RPC
-- ---------------------------------------------------------------------------

revoke all on function public.clinical_orientation_create(jsonb) from public, anon;
revoke all on function public.clinical_orientation_save_draft(jsonb) from public, anon;
revoke all on function public.clinical_orientation_publish(uuid) from public, anon;
revoke all on function public.clinical_orientation_new_version(uuid) from public, anon;
revoke all on function public.clinical_orientation_mark_viewed(uuid) from public, anon;
revoke all on function public.clinical_orientation_mark_audio_played(uuid) from public, anon;
revoke all on function public.patient_notification_dismiss(uuid) from public, anon;

grant execute on function public.clinical_orientation_create(jsonb) to authenticated;
grant execute on function public.clinical_orientation_save_draft(jsonb) to authenticated;
grant execute on function public.clinical_orientation_publish(uuid) to authenticated;
grant execute on function public.clinical_orientation_new_version(uuid) to authenticated;
grant execute on function public.clinical_orientation_mark_viewed(uuid) to authenticated;
grant execute on function public.clinical_orientation_mark_audio_played(uuid) to authenticated;
grant execute on function public.patient_notification_dismiss(uuid) to authenticated;
