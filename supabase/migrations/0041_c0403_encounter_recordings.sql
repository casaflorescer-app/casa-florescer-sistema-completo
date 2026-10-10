-- C040.3 — Gravação segmentada do atendimento + transcrição (Workspace Médico)
-- Separado de clinical_orientations (C035). Paciente/secretária NÃO leem áudio/transcrição.
-- Sem WhatsApp/Push/e-mail real. Sem SOAP automático. Sem db push nesta etapa.

-- ---------------------------------------------------------------------------
-- 1) Enums / tabelas
-- ---------------------------------------------------------------------------

create table if not exists public.encounter_recording_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  patient_id uuid not null references public.patients (id),
  encounter_id uuid not null references public.encounters (id) on delete restrict,
  appointment_id uuid references public.appointments (id),
  professional_id uuid not null references public.professionals (id),
  sequence_no integer not null check (sequence_no >= 1),
  status text not null default 'recording'
    check (status in ('recording', 'paused', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  paused_at timestamptz,
  completed_at timestamptz,
  total_duration_seconds numeric(12, 2) not null default 0,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (encounter_id, sequence_no)
);

create index if not exists encounter_recording_sessions_encounter_idx
  on public.encounter_recording_sessions (encounter_id, sequence_no desc);
create index if not exists encounter_recording_sessions_practice_idx
  on public.encounter_recording_sessions (practice_id, started_at desc);

comment on table public.encounter_recording_sessions is
  'C040.3: sessão de gravação do encounter. Múltiplas sessões por atendimento. Não é orientação C035.';

create table if not exists public.encounter_recording_segments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.encounter_recording_sessions (id) on delete cascade,
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  patient_id uuid not null references public.patients (id),
  encounter_id uuid not null references public.encounters (id) on delete restrict,
  sequence_no integer not null check (sequence_no >= 1),
  status text not null default 'pending_upload'
    check (status in ('pending_upload', 'uploaded', 'failed')),
  audio_storage_path text,
  audio_mime_type text,
  audio_byte_size bigint,
  duration_seconds numeric(12, 2) not null default 0,
  cursor_start_ms integer not null default 0 check (cursor_start_ms >= 0),
  cursor_end_ms integer not null default 0 check (cursor_end_ms >= cursor_start_ms),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  uploaded_at timestamptz,
  unique (session_id, sequence_no)
);

create index if not exists encounter_recording_segments_session_idx
  on public.encounter_recording_segments (session_id, sequence_no);
create index if not exists encounter_recording_segments_encounter_idx
  on public.encounter_recording_segments (encounter_id, created_at);

comment on table public.encounter_recording_segments is
  'C040.3: segmento de áudio. Cursor evita retranscrever trechos já cobertos.';

create table if not exists public.encounter_recording_transcriptions (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references public.encounter_recording_segments (id) on delete cascade,
  session_id uuid not null references public.encounter_recording_sessions (id) on delete cascade,
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  patient_id uuid not null references public.patients (id),
  encounter_id uuid not null references public.encounters (id) on delete restrict,
  version integer not null check (version >= 1),
  kind text not null default 'automatic'
    check (kind in ('automatic', 'reviewed')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'available', 'reviewed', 'failed', 'unavailable')),
  provider text,
  original_text text,
  reviewed_text text,
  error_message text,
  is_simulation boolean not null default false,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  unique (segment_id, version)
);

create index if not exists encounter_recording_transcriptions_segment_idx
  on public.encounter_recording_transcriptions (segment_id, version desc);
create index if not exists encounter_recording_transcriptions_encounter_idx
  on public.encounter_recording_transcriptions (encounter_id, created_at desc);

comment on table public.encounter_recording_transcriptions is
  'C040.3: original ≠ revisado. version 1 automática; revisões incrementam version sem apagar o original.';

create table if not exists public.encounter_recording_shares (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  patient_id uuid not null references public.patients (id),
  encounter_id uuid not null references public.encounters (id) on delete restrict,
  session_id uuid references public.encounter_recording_sessions (id) on delete set null,
  transcription_id uuid references public.encounter_recording_transcriptions (id) on delete set null,
  include_audio boolean not null default false,
  include_transcription boolean not null default false,
  status text not null default 'draft'
    check (status in ('draft', 'cancelled', 'queued_internal', 'failed')),
  channel text not null default 'portal_internal'
    check (channel in ('portal_internal')),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  check (include_audio or include_transcription)
);

create index if not exists encounter_recording_shares_encounter_idx
  on public.encounter_recording_shares (encounter_id, created_at desc);

comment on table public.encounter_recording_shares is
  'C040.3: preparação de compartilhamento explícito. Sem WhatsApp/e-mail/Push real nesta etapa.';

-- ---------------------------------------------------------------------------
-- 2) Storage bucket privado
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'encounter-recordings',
  'encounter-recordings',
  false,
  52428800,
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

-- Path: {organization_id}/{patient_id}/{encounter_id}/{session_id}/{segment_id}/audio
create or replace function public.encounter_recording_audio_path_ids(object_name text)
returns table (
  organization_id uuid,
  patient_id uuid,
  encounter_id uuid,
  session_id uuid,
  segment_id uuid
)
language plpgsql
stable
set search_path = public
as $$
declare
  parts text[];
begin
  parts := string_to_array(object_name, '/');
  if array_length(parts, 1) is distinct from 6 then
    return;
  end if;
  if parts[6] is distinct from 'audio' then
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
  if parts[5] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return;
  end if;
  organization_id := parts[1]::uuid;
  patient_id := parts[2]::uuid;
  encounter_id := parts[3]::uuid;
  session_id := parts[4]::uuid;
  segment_id := parts[5]::uuid;
  return next;
end;
$$;

revoke all on function public.encounter_recording_audio_path_ids(text) from public;
grant execute on function public.encounter_recording_audio_path_ids(text) to authenticated;

drop policy if exists encounter_recordings_audio_select on storage.objects;
create policy encounter_recordings_audio_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'encounter-recordings'
    and exists (
      select 1
      from public.encounter_recording_audio_path_ids(name) ids
      join public.encounter_recording_segments s on s.id = ids.segment_id
      join public.encounters e on e.id = s.encounter_id
      where s.patient_id = ids.patient_id
        and s.organization_id = ids.organization_id
        and public.can_write_clinical(s.practice_id)
        and public.can_read_clinical(s.practice_id, s.patient_id, e.professional_id)
    )
  );

drop policy if exists encounter_recordings_audio_insert on storage.objects;
create policy encounter_recordings_audio_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'encounter-recordings'
    and exists (
      select 1
      from public.encounter_recording_audio_path_ids(name) ids
      join public.encounter_recording_segments s on s.id = ids.segment_id
      join public.encounter_recording_sessions sess on sess.id = s.session_id
      join public.encounters e on e.id = s.encounter_id
      where s.patient_id = ids.patient_id
        and s.organization_id = ids.organization_id
        and s.session_id = ids.session_id
        and sess.status in ('recording', 'paused', 'completed')
        and e.status = 'open'::public.encounter_status
        and public.can_write_clinical(s.practice_id)
        and exists (
          select 1 from public.professionals pr
          where pr.id = e.professional_id
            and pr.profile_id = auth.uid()
            and pr.practice_id = e.practice_id
        )
    )
  );

drop policy if exists encounter_recordings_audio_update on storage.objects;
create policy encounter_recordings_audio_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'encounter-recordings'
    and exists (
      select 1
      from public.encounter_recording_audio_path_ids(name) ids
      join public.encounter_recording_segments s on s.id = ids.segment_id
      join public.encounters e on e.id = s.encounter_id
      where e.status = 'open'::public.encounter_status
        and public.can_write_clinical(s.practice_id)
        and exists (
          select 1 from public.professionals pr
          where pr.id = e.professional_id
            and pr.profile_id = auth.uid()
            and pr.practice_id = e.practice_id
        )
    )
  )
  with check (
    bucket_id = 'encounter-recordings'
    and exists (
      select 1
      from public.encounter_recording_audio_path_ids(name) ids
      join public.encounter_recording_segments s on s.id = ids.segment_id
      join public.encounters e on e.id = s.encounter_id
      where e.status = 'open'::public.encounter_status
        and public.can_write_clinical(s.practice_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 3) RLS tabelas
-- ---------------------------------------------------------------------------

revoke all on table public.encounter_recording_sessions from public, anon, authenticated;
revoke all on table public.encounter_recording_segments from public, anon, authenticated;
revoke all on table public.encounter_recording_transcriptions from public, anon, authenticated;
revoke all on table public.encounter_recording_shares from public, anon, authenticated;

grant select on table public.encounter_recording_sessions to authenticated;
grant select on table public.encounter_recording_segments to authenticated;
grant select on table public.encounter_recording_transcriptions to authenticated;
grant select on table public.encounter_recording_shares to authenticated;

alter table public.encounter_recording_sessions enable row level security;
alter table public.encounter_recording_segments enable row level security;
alter table public.encounter_recording_transcriptions enable row level security;
alter table public.encounter_recording_shares enable row level security;

-- Somente médica com can_read_clinical (secretária/paciente bloqueadas).
drop policy if exists encounter_recording_sessions_physician_select on public.encounter_recording_sessions;
create policy encounter_recording_sessions_physician_select on public.encounter_recording_sessions
  for select to authenticated
  using (public.can_read_clinical(practice_id, patient_id, professional_id));

drop policy if exists encounter_recording_segments_physician_select on public.encounter_recording_segments;
create policy encounter_recording_segments_physician_select on public.encounter_recording_segments
  for select to authenticated
  using (
    public.can_read_clinical(
      practice_id,
      patient_id,
      (select e.professional_id from public.encounters e where e.id = encounter_id)
    )
  );

drop policy if exists encounter_recording_transcriptions_physician_select on public.encounter_recording_transcriptions;
create policy encounter_recording_transcriptions_physician_select on public.encounter_recording_transcriptions
  for select to authenticated
  using (
    public.can_read_clinical(
      practice_id,
      patient_id,
      (select e.professional_id from public.encounters e where e.id = encounter_id)
    )
  );

drop policy if exists encounter_recording_shares_physician_select on public.encounter_recording_shares;
create policy encounter_recording_shares_physician_select on public.encounter_recording_shares
  for select to authenticated
  using (
    public.can_read_clinical(
      practice_id,
      patient_id,
      (select e.professional_id from public.encounters e where e.id = encounter_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 4) Helpers internos
-- ---------------------------------------------------------------------------

create or replace function public.encounter_recording_assert_owner(p_encounter_id uuid)
returns public.encounters
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc public.encounters%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_enc
  from public.encounters
  where id = p_encounter_id
  for share;

  if not found then
    raise exception 'ENCOUNTER_NOT_FOUND';
  end if;

  if not public.can_write_clinical(v_enc.practice_id) then
    raise exception 'FORBIDDEN';
  end if;

  if not public.can_read_clinical(v_enc.practice_id, v_enc.patient_id, v_enc.professional_id) then
    raise exception 'FORBIDDEN';
  end if;

  if not exists (
    select 1
    from public.professionals pr
    where pr.id = v_enc.professional_id
      and pr.profile_id = auth.uid()
      and pr.practice_id = v_enc.practice_id
  ) then
    raise exception 'ENCOUNTER_OWNER_REQUIRED';
  end if;

  return v_enc;
end;
$$;

revoke all on function public.encounter_recording_assert_owner(uuid) from public, anon;
grant execute on function public.encounter_recording_assert_owner(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) RPCs
-- ---------------------------------------------------------------------------

create or replace function public.encounter_recording_start(p_encounter_id uuid)
returns public.encounter_recording_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc public.encounters%rowtype;
  v_seq integer;
  v_row public.encounter_recording_sessions%rowtype;
begin
  v_enc := public.encounter_recording_assert_owner(p_encounter_id);

  if v_enc.status is distinct from 'open'::public.encounter_status then
    raise exception 'ENCOUNTER_NOT_OPEN';
  end if;

  if exists (
    select 1 from public.encounter_recording_sessions s
    where s.encounter_id = v_enc.id
      and s.status in ('recording', 'paused')
  ) then
    raise exception 'RECORDING_ALREADY_ACTIVE';
  end if;

  select coalesce(max(sequence_no), 0) + 1 into v_seq
  from public.encounter_recording_sessions
  where encounter_id = v_enc.id;

  insert into public.encounter_recording_sessions (
    organization_id, practice_id, patient_id, encounter_id, appointment_id,
    professional_id, sequence_no, status, created_by
  ) values (
    v_enc.organization_id, v_enc.practice_id, v_enc.patient_id, v_enc.id, v_enc.appointment_id,
    v_enc.professional_id, v_seq, 'recording', auth.uid()
  )
  returning * into v_row;

  perform public.write_audit(
    'insert'::public.audit_action,
    'encounter_recording_sessions',
    v_row.id,
    v_enc.practice_id,
    v_enc.patient_id,
    jsonb_build_object(
      'rpc', 'encounter_recording_start',
      'event', 'RECORDING_STARTED',
      'encounter_id', v_enc.id,
      'sequence_no', v_row.sequence_no
    )
  );

  return v_row;
end;
$$;

create or replace function public.encounter_recording_set_status(
  p_session_id uuid,
  p_status text
)
returns public.encounter_recording_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.encounter_recording_sessions%rowtype;
  v_enc public.encounters%rowtype;
  v_event text;
begin
  if p_status not in ('paused', 'recording', 'completed') then
    raise exception 'INVALID_STATUS';
  end if;

  select * into v_row
  from public.encounter_recording_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  v_enc := public.encounter_recording_assert_owner(v_row.encounter_id);

  if v_enc.status is distinct from 'open'::public.encounter_status then
    raise exception 'ENCOUNTER_NOT_OPEN';
  end if;

  if v_row.status = 'completed' then
    raise exception 'SESSION_ALREADY_COMPLETED';
  end if;

  if p_status = 'paused' then
    if v_row.status is distinct from 'recording' then
      raise exception 'SESSION_NOT_RECORDING';
    end if;
    update public.encounter_recording_sessions
       set status = 'paused',
           paused_at = now(),
           updated_at = now()
     where id = v_row.id
    returning * into v_row;
    v_event := 'RECORDING_PAUSED';
  elsif p_status = 'recording' then
    if v_row.status is distinct from 'paused' then
      raise exception 'SESSION_NOT_PAUSED';
    end if;
    update public.encounter_recording_sessions
       set status = 'recording',
           paused_at = null,
           updated_at = now()
     where id = v_row.id
    returning * into v_row;
    v_event := 'RECORDING_RESUMED';
  else
    update public.encounter_recording_sessions
       set status = 'completed',
           completed_at = now(),
           paused_at = null,
           updated_at = now()
     where id = v_row.id
    returning * into v_row;
    v_event := 'RECORDING_COMPLETED';
  end if;

  perform public.write_audit(
    'update'::public.audit_action,
    'encounter_recording_sessions',
    v_row.id,
    v_enc.practice_id,
    v_enc.patient_id,
    jsonb_build_object(
      'rpc', 'encounter_recording_set_status',
      'event', v_event,
      'encounter_id', v_enc.id,
      'status', v_row.status
    )
  );

  return v_row;
end;
$$;

create or replace function public.encounter_recording_register_segment(
  p_session_id uuid,
  p_duration_seconds numeric,
  p_cursor_start_ms integer,
  p_cursor_end_ms integer,
  p_mime_type text default null
)
returns public.encounter_recording_segments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sess public.encounter_recording_sessions%rowtype;
  v_enc public.encounters%rowtype;
  v_seq integer;
  v_row public.encounter_recording_segments%rowtype;
  v_path text;
begin
  select * into v_sess
  from public.encounter_recording_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  v_enc := public.encounter_recording_assert_owner(v_sess.encounter_id);

  if v_enc.status is distinct from 'open'::public.encounter_status then
    raise exception 'ENCOUNTER_NOT_OPEN';
  end if;

  if v_sess.status = 'completed' then
    raise exception 'SESSION_ALREADY_COMPLETED';
  end if;

  if coalesce(p_cursor_end_ms, 0) < coalesce(p_cursor_start_ms, 0) then
    raise exception 'INVALID_CURSOR';
  end if;

  select coalesce(max(sequence_no), 0) + 1 into v_seq
  from public.encounter_recording_segments
  where session_id = v_sess.id;

  insert into public.encounter_recording_segments (
    session_id, organization_id, practice_id, patient_id, encounter_id,
    sequence_no, status, audio_mime_type, duration_seconds,
    cursor_start_ms, cursor_end_ms, created_by
  ) values (
    v_sess.id, v_sess.organization_id, v_sess.practice_id, v_sess.patient_id, v_sess.encounter_id,
    v_seq, 'pending_upload', nullif(trim(coalesce(p_mime_type, '')), ''),
    greatest(coalesce(p_duration_seconds, 0), 0),
    greatest(coalesce(p_cursor_start_ms, 0), 0),
    greatest(coalesce(p_cursor_end_ms, 0), 0),
    auth.uid()
  )
  returning * into v_row;

  v_path := v_sess.organization_id::text || '/' ||
            v_sess.patient_id::text || '/' ||
            v_sess.encounter_id::text || '/' ||
            v_sess.id::text || '/' ||
            v_row.id::text || '/audio';

  update public.encounter_recording_segments
     set audio_storage_path = v_path
   where id = v_row.id
  returning * into v_row;

  update public.encounter_recording_sessions
     set total_duration_seconds = total_duration_seconds + greatest(coalesce(p_duration_seconds, 0), 0),
         updated_at = now()
   where id = v_sess.id;

  perform public.write_audit(
    'insert'::public.audit_action,
    'encounter_recording_segments',
    v_row.id,
    v_enc.practice_id,
    v_enc.patient_id,
    jsonb_build_object(
      'rpc', 'encounter_recording_register_segment',
      'event', 'RECORDING_SEGMENT_REGISTERED',
      'encounter_id', v_enc.id,
      'session_id', v_sess.id,
      'sequence_no', v_row.sequence_no,
      'cursor_start_ms', v_row.cursor_start_ms,
      'cursor_end_ms', v_row.cursor_end_ms
    )
  );

  return v_row;
end;
$$;

create or replace function public.encounter_recording_mark_segment_uploaded(
  p_segment_id uuid,
  p_byte_size bigint default null,
  p_mime_type text default null
)
returns public.encounter_recording_segments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.encounter_recording_segments%rowtype;
  v_enc public.encounters%rowtype;
begin
  select * into v_row
  from public.encounter_recording_segments
  where id = p_segment_id
  for update;

  if not found then
    raise exception 'SEGMENT_NOT_FOUND';
  end if;

  v_enc := public.encounter_recording_assert_owner(v_row.encounter_id);

  if v_enc.status is distinct from 'open'::public.encounter_status then
    raise exception 'ENCOUNTER_NOT_OPEN';
  end if;

  update public.encounter_recording_segments
     set status = 'uploaded',
         uploaded_at = now(),
         audio_byte_size = coalesce(p_byte_size, audio_byte_size),
         audio_mime_type = coalesce(nullif(trim(coalesce(p_mime_type, '')), ''), audio_mime_type)
   where id = v_row.id
  returning * into v_row;

  perform public.write_audit(
    'update'::public.audit_action,
    'encounter_recording_segments',
    v_row.id,
    v_enc.practice_id,
    v_enc.patient_id,
    jsonb_build_object(
      'rpc', 'encounter_recording_mark_segment_uploaded',
      'event', 'RECORDING_SEGMENT_UPLOADED',
      'encounter_id', v_enc.id,
      'session_id', v_row.session_id
    )
  );

  return v_row;
end;
$$;

create or replace function public.encounter_recording_request_transcription(
  p_segment_id uuid
)
returns public.encounter_recording_transcriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seg public.encounter_recording_segments%rowtype;
  v_enc public.encounters%rowtype;
  v_ver integer;
  v_row public.encounter_recording_transcriptions%rowtype;
begin
  select * into v_seg
  from public.encounter_recording_segments
  where id = p_segment_id
  for share;

  if not found then
    raise exception 'SEGMENT_NOT_FOUND';
  end if;

  v_enc := public.encounter_recording_assert_owner(v_seg.encounter_id);

  if v_enc.status is distinct from 'open'::public.encounter_status then
    raise exception 'ENCOUNTER_NOT_OPEN';
  end if;

  if v_seg.status is distinct from 'uploaded' or v_seg.audio_storage_path is null then
    raise exception 'SEGMENT_AUDIO_REQUIRED';
  end if;

  -- Evita reprocessar se já há available/reviewed/processing para o segmento.
  if exists (
    select 1 from public.encounter_recording_transcriptions t
    where t.segment_id = v_seg.id
      and t.status in ('processing', 'available', 'reviewed')
  ) then
    select * into v_row
    from public.encounter_recording_transcriptions t
    where t.segment_id = v_seg.id
    order by t.version desc
    limit 1;
    return v_row;
  end if;

  select coalesce(max(version), 0) + 1 into v_ver
  from public.encounter_recording_transcriptions
  where segment_id = v_seg.id;

  insert into public.encounter_recording_transcriptions (
    segment_id, session_id, organization_id, practice_id, patient_id, encounter_id,
    version, kind, status, created_by
  ) values (
    v_seg.id, v_seg.session_id, v_seg.organization_id, v_seg.practice_id, v_seg.patient_id, v_seg.encounter_id,
    v_ver, 'automatic', 'pending', auth.uid()
  )
  returning * into v_row;

  perform public.write_audit(
    'insert'::public.audit_action,
    'encounter_recording_transcriptions',
    v_row.id,
    v_enc.practice_id,
    v_enc.patient_id,
    jsonb_build_object(
      'rpc', 'encounter_recording_request_transcription',
      'event', 'TRANSCRIPTION_REQUESTED',
      'encounter_id', v_enc.id,
      'segment_id', v_seg.id,
      'version', v_row.version
    )
  );

  return v_row;
end;
$$;

create or replace function public.encounter_recording_save_transcription_result(
  p_transcription_id uuid,
  p_status text,
  p_provider text default null,
  p_original_text text default null,
  p_error_message text default null,
  p_is_simulation boolean default false
)
returns public.encounter_recording_transcriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.encounter_recording_transcriptions%rowtype;
  v_enc public.encounters%rowtype;
  v_event text;
begin
  if p_status not in ('processing', 'available', 'failed', 'unavailable') then
    raise exception 'INVALID_STATUS';
  end if;

  select * into v_row
  from public.encounter_recording_transcriptions
  where id = p_transcription_id
  for update;

  if not found then
    raise exception 'TRANSCRIPTION_NOT_FOUND';
  end if;

  v_enc := public.encounter_recording_assert_owner(v_row.encounter_id);

  update public.encounter_recording_transcriptions
     set status = p_status,
         provider = coalesce(nullif(trim(coalesce(p_provider, '')), ''), provider),
         original_text = case
           when p_status = 'available' then coalesce(p_original_text, original_text)
           else original_text
         end,
         error_message = case
           when p_status in ('failed', 'unavailable') then p_error_message
           else null
         end,
         is_simulation = coalesce(p_is_simulation, is_simulation)
   where id = v_row.id
  returning * into v_row;

  v_event := case p_status
    when 'processing' then 'TRANSCRIPTION_STARTED'
    when 'available' then 'TRANSCRIPTION_COMPLETED'
    when 'failed' then 'TRANSCRIPTION_FAILED'
    else 'TRANSCRIPTION_UNAVAILABLE'
  end;

  perform public.write_audit(
    'update'::public.audit_action,
    'encounter_recording_transcriptions',
    v_row.id,
    v_enc.practice_id,
    v_enc.patient_id,
    jsonb_build_object(
      'rpc', 'encounter_recording_save_transcription_result',
      'event', v_event,
      'encounter_id', v_enc.id,
      'status', p_status,
      'provider', v_row.provider,
      'is_simulation', v_row.is_simulation
    )
  );

  return v_row;
end;
$$;

create or replace function public.encounter_recording_review_transcription(
  p_transcription_id uuid,
  p_reviewed_text text
)
returns public.encounter_recording_transcriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src public.encounter_recording_transcriptions%rowtype;
  v_enc public.encounters%rowtype;
  v_ver integer;
  v_row public.encounter_recording_transcriptions%rowtype;
  v_text text;
begin
  v_text := trim(coalesce(p_reviewed_text, ''));
  if char_length(v_text) < 1 then
    raise exception 'REVIEW_TEXT_REQUIRED';
  end if;

  select * into v_src
  from public.encounter_recording_transcriptions
  where id = p_transcription_id
  for share;

  if not found then
    raise exception 'TRANSCRIPTION_NOT_FOUND';
  end if;

  v_enc := public.encounter_recording_assert_owner(v_src.encounter_id);

  if v_enc.status is distinct from 'open'::public.encounter_status then
    raise exception 'ENCOUNTER_NOT_OPEN';
  end if;

  if v_src.status not in ('available', 'reviewed') then
    raise exception 'TRANSCRIPTION_NOT_REVIEWABLE';
  end if;

  -- Marca origem e cria nova versão reviewed (preserva original).
  update public.encounter_recording_transcriptions
     set status = case when status = 'available' then 'reviewed' else status end,
         reviewed_by = coalesce(reviewed_by, auth.uid()),
         reviewed_at = coalesce(reviewed_at, now())
   where id = v_src.id;

  select coalesce(max(version), 0) + 1 into v_ver
  from public.encounter_recording_transcriptions
  where segment_id = v_src.segment_id;

  insert into public.encounter_recording_transcriptions (
    segment_id, session_id, organization_id, practice_id, patient_id, encounter_id,
    version, kind, status, provider, original_text, reviewed_text, is_simulation,
    created_by, reviewed_by, reviewed_at
  ) values (
    v_src.segment_id, v_src.session_id, v_src.organization_id, v_src.practice_id, v_src.patient_id, v_src.encounter_id,
    v_ver, 'reviewed', 'reviewed', v_src.provider, v_src.original_text, v_text, v_src.is_simulation,
    auth.uid(), auth.uid(), now()
  )
  returning * into v_row;

  perform public.write_audit(
    'insert'::public.audit_action,
    'encounter_recording_transcriptions',
    v_row.id,
    v_enc.practice_id,
    v_enc.patient_id,
    jsonb_build_object(
      'rpc', 'encounter_recording_review_transcription',
      'event', 'TRANSCRIPTION_REVIEWED',
      'encounter_id', v_enc.id,
      'segment_id', v_src.segment_id,
      'version', v_row.version,
      'source_version', v_src.version
    )
  );

  return v_row;
end;
$$;

create or replace function public.encounter_recording_prepare_share(
  p_encounter_id uuid,
  p_session_id uuid default null,
  p_transcription_id uuid default null,
  p_include_audio boolean default false,
  p_include_transcription boolean default false
)
returns public.encounter_recording_shares
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc public.encounters%rowtype;
  v_row public.encounter_recording_shares%rowtype;
begin
  v_enc := public.encounter_recording_assert_owner(p_encounter_id);

  if not coalesce(p_include_audio, false) and not coalesce(p_include_transcription, false) then
    raise exception 'SHARE_CONTENT_REQUIRED';
  end if;

  insert into public.encounter_recording_shares (
    organization_id, practice_id, patient_id, encounter_id,
    session_id, transcription_id, include_audio, include_transcription,
    status, channel, created_by
  ) values (
    v_enc.organization_id, v_enc.practice_id, v_enc.patient_id, v_enc.id,
    p_session_id, p_transcription_id,
    coalesce(p_include_audio, false), coalesce(p_include_transcription, false),
    'draft', 'portal_internal', auth.uid()
  )
  returning * into v_row;

  perform public.write_audit(
    'insert'::public.audit_action,
    'encounter_recording_shares',
    v_row.id,
    v_enc.practice_id,
    v_enc.patient_id,
    jsonb_build_object(
      'rpc', 'encounter_recording_prepare_share',
      'event', 'TRANSCRIPTION_SHARE_DRAFT',
      'encounter_id', v_enc.id,
      'include_audio', v_row.include_audio,
      'include_transcription', v_row.include_transcription
    )
  );

  return v_row;
end;
$$;

create or replace function public.encounter_recording_confirm_share(
  p_share_id uuid,
  p_confirm boolean
)
returns public.encounter_recording_shares
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.encounter_recording_shares%rowtype;
  v_enc public.encounters%rowtype;
begin
  select * into v_row
  from public.encounter_recording_shares
  where id = p_share_id
  for update;

  if not found then
    raise exception 'SHARE_NOT_FOUND';
  end if;

  v_enc := public.encounter_recording_assert_owner(v_row.encounter_id);

  if v_row.status is distinct from 'draft' then
    raise exception 'SHARE_NOT_DRAFT';
  end if;

  if p_confirm then
    -- Sem canal externo nesta etapa: fica queued_internal (arquitetura preparada).
    update public.encounter_recording_shares
       set status = 'queued_internal',
           confirmed_at = now()
     where id = v_row.id
    returning * into v_row;

    perform public.write_audit(
      'update'::public.audit_action,
      'encounter_recording_shares',
      v_row.id,
      v_enc.practice_id,
      v_enc.patient_id,
      jsonb_build_object(
        'rpc', 'encounter_recording_confirm_share',
        'event', 'TRANSCRIPTION_SHARED',
        'encounter_id', v_enc.id,
        'channel', v_row.channel,
        'status', v_row.status
      )
    );
  else
    update public.encounter_recording_shares
       set status = 'cancelled',
           cancelled_at = now()
     where id = v_row.id
    returning * into v_row;

    perform public.write_audit(
      'update'::public.audit_action,
      'encounter_recording_shares',
      v_row.id,
      v_enc.practice_id,
      v_enc.patient_id,
      jsonb_build_object(
        'rpc', 'encounter_recording_confirm_share',
        'event', 'TRANSCRIPTION_SHARE_CANCELLED',
        'encounter_id', v_enc.id
      )
    );
  end if;

  return v_row;
end;
$$;

create or replace function public.encounter_recording_list(p_encounter_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc public.encounters%rowtype;
begin
  v_enc := public.encounter_recording_assert_owner(p_encounter_id);

  -- Também permite leitura se can_read_clinical (já validado no assert para owner).
  -- Listagem só para dona do encounter open ou signed (assert exige owner).
  return jsonb_build_object(
    'sessions', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.sequence_no)
      from public.encounter_recording_sessions s
      where s.encounter_id = v_enc.id
    ), '[]'::jsonb),
    'segments', coalesce((
      select jsonb_agg(to_jsonb(g) order by g.created_at)
      from public.encounter_recording_segments g
      where g.encounter_id = v_enc.id
    ), '[]'::jsonb),
    'transcriptions', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.created_at)
      from public.encounter_recording_transcriptions t
      where t.encounter_id = v_enc.id
    ), '[]'::jsonb)
  );
end;
$$;

-- Grants
revoke all on function public.encounter_recording_start(uuid) from public, anon;
revoke all on function public.encounter_recording_set_status(uuid, text) from public, anon;
revoke all on function public.encounter_recording_register_segment(uuid, numeric, integer, integer, text) from public, anon;
revoke all on function public.encounter_recording_mark_segment_uploaded(uuid, bigint, text) from public, anon;
revoke all on function public.encounter_recording_request_transcription(uuid) from public, anon;
revoke all on function public.encounter_recording_save_transcription_result(uuid, text, text, text, text, boolean) from public, anon;
revoke all on function public.encounter_recording_review_transcription(uuid, text) from public, anon;
revoke all on function public.encounter_recording_prepare_share(uuid, uuid, uuid, boolean, boolean) from public, anon;
revoke all on function public.encounter_recording_confirm_share(uuid, boolean) from public, anon;
revoke all on function public.encounter_recording_list(uuid) from public, anon;

grant execute on function public.encounter_recording_start(uuid) to authenticated;
grant execute on function public.encounter_recording_set_status(uuid, text) to authenticated;
grant execute on function public.encounter_recording_register_segment(uuid, numeric, integer, integer, text) to authenticated;
grant execute on function public.encounter_recording_mark_segment_uploaded(uuid, bigint, text) to authenticated;
grant execute on function public.encounter_recording_request_transcription(uuid) to authenticated;
grant execute on function public.encounter_recording_save_transcription_result(uuid, text, text, text, text, boolean) to authenticated;
grant execute on function public.encounter_recording_review_transcription(uuid, text) to authenticated;
grant execute on function public.encounter_recording_prepare_share(uuid, uuid, uuid, boolean, boolean) to authenticated;
grant execute on function public.encounter_recording_confirm_share(uuid, boolean) to authenticated;
grant execute on function public.encounter_recording_list(uuid) to authenticated;
