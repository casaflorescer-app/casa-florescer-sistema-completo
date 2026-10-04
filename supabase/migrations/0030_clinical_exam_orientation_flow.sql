-- C032.4 consolidado — exames no fluxo clínico + vínculos + feedback + AUDIO_ONLY
-- + status de transcrição UNAVAILABLE/NOT_REQUESTED.
-- Não altera SOAP / agenda / obstetrícia. Sem WhatsApp / IA real.

-- ---------------------------------------------------------------------------
-- 1) Extensões em exam_orders (sem recriar tabela; enum legado preservado)
-- ---------------------------------------------------------------------------

alter table public.exam_orders
  add column if not exists source text,
  add column if not exists observation text,
  add column if not exists document_date date,
  add column if not exists encounter_id uuid references public.encounters (id),
  add column if not exists clinical_status text,
  add column if not exists analysis_notes text,
  add column if not exists analyzed_at timestamptz,
  add column if not exists analyzed_by uuid references public.profiles (id),
  add column if not exists created_by uuid references public.profiles (id),
  add column if not exists updated_at timestamptz not null default now();

update public.exam_orders
   set clinical_status = coalesce(
     clinical_status,
     case status
       when 'pending' then 'RECEBIDO'
       when 'received' then 'DISPONIVEL_PARA_ANALISE'
       when 'available' then 'ANALISADO'
       when 'picked_up' then 'ORIENTACAO_PUBLICADA'
       else 'RECEBIDO'
     end
   ),
       source = coalesce(source, 'secretaria')
 where clinical_status is null or source is null;

alter table public.exam_orders
  alter column clinical_status set default 'RECEBIDO',
  alter column clinical_status set not null,
  alter column source set default 'secretaria',
  alter column source set not null;

alter table public.exam_orders
  drop constraint if exists exam_orders_source_check;
alter table public.exam_orders
  add constraint exam_orders_source_check
  check (source in ('paciente', 'secretaria'));

alter table public.exam_orders
  drop constraint if exists exam_orders_clinical_status_check;
alter table public.exam_orders
  add constraint exam_orders_clinical_status_check
  check (
    clinical_status in (
      'RECEBIDO',
      'DISPONIVEL_PARA_ANALISE',
      'EM_ANALISE',
      'ANALISADO',
      'ORIENTACAO_PENDENTE',
      'ORIENTACAO_PUBLICADA'
    )
  );

comment on column public.exam_orders.clinical_status is
  'Ciclo clínico C032.4. Enum exam_status legado permanece para compatibilidade.';
comment on column public.exam_orders.source is
  'Origem do anexo: paciente | secretaria.';

alter table public.exam_uploads
  add column if not exists mime_type text,
  add column if not exists byte_size bigint,
  add column if not exists uploaded_by_patient boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2) Bucket privado de exames
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clinical-exams',
  'clinical-exams',
  false,
  52428800,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path: {organization_id}/{patient_id}/{exam_order_id}/{upload_id}/file
create or replace function public.clinical_exam_path_ids(object_name text)
returns table (
  organization_id uuid,
  patient_id uuid,
  exam_order_id uuid,
  upload_id uuid
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
  if parts[5] is distinct from 'file' then
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
  exam_order_id := parts[3]::uuid;
  upload_id := parts[4]::uuid;
  return next;
end;
$$;

revoke all on function public.clinical_exam_path_ids(text) from public;
grant execute on function public.clinical_exam_path_ids(text) to authenticated;

drop policy if exists clinical_exams_select on storage.objects;
create policy clinical_exams_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'clinical-exams'
    and exists (
      select 1
      from public.clinical_exam_path_ids(name) ids
      join public.exam_uploads u on u.id = ids.upload_id
      where u.patient_id = ids.patient_id
        and u.organization_id = ids.organization_id
        and public.can_read_exam_file(u.practice_id, u.patient_id, u.organization_id)
    )
  );

drop policy if exists clinical_exams_insert on storage.objects;
create policy clinical_exams_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'clinical-exams'
    and exists (
      select 1
      from public.clinical_exam_path_ids(name) ids
      join public.exam_orders o on o.id = ids.exam_order_id
      where o.patient_id = ids.patient_id
        and o.organization_id = ids.organization_id
        and (
          public.is_patient_self(o.patient_id)
          or public.is_house_ops(o.organization_id)
          or public.has_practice_role(o.practice_id, array['physician']::public.app_role[])
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 3) Orientações: vínculos, AUDIO_ONLY, transcription unavailable
-- ---------------------------------------------------------------------------

alter table public.clinical_orientations
  add column if not exists primary_exam_order_id uuid references public.exam_orders (id);

create table if not exists public.clinical_orientation_exams (
  orientation_id uuid not null references public.clinical_orientations (id) on delete cascade,
  exam_order_id uuid not null references public.exam_orders (id) on delete restrict,
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  patient_id uuid not null references public.patients (id),
  created_at timestamptz not null default now(),
  primary key (orientation_id, exam_order_id)
);

create index if not exists clinical_orientation_exams_exam_idx
  on public.clinical_orientation_exams (exam_order_id);

comment on table public.clinical_orientation_exams is
  'Exames relacionados a uma orientação clínica. Sem duplicar arquivo.';

alter table public.clinical_orientation_versions
  drop constraint if exists clinical_orientation_versions_delivery_mode_check;
alter table public.clinical_orientation_versions
  add constraint clinical_orientation_versions_delivery_mode_check
  check (
    delivery_mode is null
    or delivery_mode in ('TEXT_ONLY', 'AUDIO_ONLY', 'TEXT_AND_AUDIO')
  );

alter table public.clinical_orientation_versions
  drop constraint if exists clinical_orientation_versions_transcription_status_check;
alter table public.clinical_orientation_versions
  add constraint clinical_orientation_versions_transcription_status_check
  check (
    transcription_status in (
      'not_requested',
      'pending',
      'processing',
      'completed',
      'failed',
      'skipped',
      'unavailable'
    )
  );

alter table public.clinical_orientation_versions
  alter column transcription_status set default 'unavailable';

update public.clinical_orientation_versions
   set transcription_status = 'unavailable'
 where transcription_status = 'pending'
   and transcription_text is null
   and status = 'draft';

-- Publicação: texto e/ou áudio conforme delivery_mode
alter table public.clinical_orientation_versions
  drop constraint if exists clinical_orientation_versions_check;
alter table public.clinical_orientation_versions
  drop constraint if exists clinical_orientation_versions_published_check;
alter table public.clinical_orientation_versions
  add constraint clinical_orientation_versions_published_check
  check (
    status <> 'published'
    or (
      delivery_mode is not null
      and reviewed_confirmed = true
      and published_at is not null
      and published_by is not null
      and (
        (
          delivery_mode = 'TEXT_ONLY'
          and final_text is not null
          and btrim(final_text) <> ''
        )
        or (
          delivery_mode = 'AUDIO_ONLY'
          and audio_storage_path is not null
        )
        or (
          delivery_mode = 'TEXT_AND_AUDIO'
          and final_text is not null
          and btrim(final_text) <> ''
          and audio_storage_path is not null
        )
      )
    )
  );

alter table public.clinical_orientation_versions
  drop constraint if exists clinical_orientation_versions_check1;

alter table public.prescriptions
  add column if not exists orientation_id uuid references public.clinical_orientations (id),
  add column if not exists exam_order_id uuid references public.exam_orders (id),
  add column if not exists published_to_patient_at timestamptz,
  add column if not exists viewed_by_patient_at timestamptz;

-- ---------------------------------------------------------------------------
-- 4) Feedback da paciente
-- ---------------------------------------------------------------------------

create table if not exists public.orientation_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  patient_id uuid not null references public.patients (id),
  orientation_id uuid not null references public.clinical_orientations (id) on delete cascade,
  orientation_version_id uuid not null references public.clinical_orientation_versions (id),
  kind text not null check (kind in ('understood', 'clarification_request')),
  message text,
  status text not null default 'open'
    check (status in ('open', 'answered', 'closed')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  answered_by uuid references public.profiles (id),
  response_orientation_id uuid references public.clinical_orientations (id)
);

create index if not exists orientation_feedback_orientation_idx
  on public.orientation_feedback (orientation_id, created_at desc);
create index if not exists orientation_feedback_practice_open_idx
  on public.orientation_feedback (practice_id, status, created_at desc)
  where status = 'open';

comment on table public.orientation_feedback is
  'Feedback da paciente sobre orientação publicada. Sem acesso a SOAP/notas internas.';

-- ---------------------------------------------------------------------------
-- 5) RLS novas tabelas
-- ---------------------------------------------------------------------------

revoke all on table public.clinical_orientation_exams from public, anon, authenticated;
revoke all on table public.orientation_feedback from public, anon, authenticated;
grant select on table public.clinical_orientation_exams to authenticated;
grant select on table public.orientation_feedback to authenticated;

alter table public.clinical_orientation_exams enable row level security;
alter table public.orientation_feedback enable row level security;

drop policy if exists clinical_orientation_exams_physician_select on public.clinical_orientation_exams;
create policy clinical_orientation_exams_physician_select on public.clinical_orientation_exams
  for select to authenticated
  using (
    exists (
      select 1 from public.clinical_orientations o
      where o.id = orientation_id
        and public.can_read_clinical(o.practice_id, o.patient_id, o.professional_id)
    )
  );

drop policy if exists clinical_orientation_exams_patient_select on public.clinical_orientation_exams;
create policy clinical_orientation_exams_patient_select on public.clinical_orientation_exams
  for select to authenticated
  using (
    public.is_patient_self(patient_id)
    and exists (
      select 1 from public.clinical_orientations o
      where o.id = orientation_id
        and o.current_published_version_id is not null
    )
  );

drop policy if exists orientation_feedback_patient_select on public.orientation_feedback;
create policy orientation_feedback_patient_select on public.orientation_feedback
  for select to authenticated
  using (public.is_patient_self(patient_id));

drop policy if exists orientation_feedback_physician_select on public.orientation_feedback;
create policy orientation_feedback_physician_select on public.orientation_feedback
  for select to authenticated
  using (
    exists (
      select 1 from public.clinical_orientations o
      where o.id = orientation_id
        and public.can_read_clinical(o.practice_id, o.patient_id, o.professional_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 6) Helper: notificar médicas da prática
-- ---------------------------------------------------------------------------

create or replace function public.exam_notify_practice_physicians(
  p_organization_id uuid,
  p_practice_id uuid,
  p_exam_order_id uuid,
  p_title text,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid;
begin
  for v_profile in
    select distinct upr.user_id
    from public.user_practice_roles upr
    where upr.practice_id = p_practice_id
      and upr.role = 'physician'
  loop
    insert into public.staff_notifications (
      organization_id, practice_id, recipient_profile_id,
      event_type, title, message, reference_type, reference_id
    ) values (
      p_organization_id, p_practice_id, v_profile,
      'exam_awaiting_analysis', p_title, p_message,
      'exam_order', p_exam_order_id
    );
  end loop;
end;
$$;

revoke all on function public.exam_notify_practice_physicians(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7) RPCs exames
-- ---------------------------------------------------------------------------

create or replace function public.exam_order_submit(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_practice uuid;
  v_patient uuid;
  v_title text;
  v_source text;
  v_observation text;
  v_document_date date;
  v_encounter uuid;
  v_order public.exam_orders%rowtype;
  v_upload_id uuid := gen_random_uuid();
  v_path text;
  v_is_patient boolean;
  v_is_ops boolean;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  begin
    v_org := (p_payload->>'organization_id')::uuid;
    v_practice := (p_payload->>'practice_id')::uuid;
    v_patient := (p_payload->>'patient_id')::uuid;
    v_encounter := nullif(p_payload->>'encounter_id', '')::uuid;
    v_document_date := nullif(p_payload->>'document_date', '')::date;
  exception when others then
    raise exception 'EXAM_INVALID';
  end;

  v_title := nullif(btrim(coalesce(p_payload->>'title', '')), '');
  v_source := coalesce(nullif(p_payload->>'source', ''), 'paciente');
  v_observation := nullif(btrim(coalesce(p_payload->>'observation', '')), '');

  if v_org is null or v_practice is null or v_patient is null or v_title is null then
    raise exception 'EXAM_INVALID';
  end if;

  if v_source not in ('paciente', 'secretaria') then
    raise exception 'EXAM_INVALID_SOURCE';
  end if;

  v_is_patient := public.is_patient_self(v_patient);
  v_is_ops := public.is_house_ops(v_org)
    or public.has_practice_role(v_practice, array['secretary']::public.app_role[]);

  if v_source = 'paciente' and not v_is_patient then
    raise exception 'FORBIDDEN';
  end if;

  if v_source = 'secretaria' and not v_is_ops
     and not public.has_practice_role(v_practice, array['physician']::public.app_role[]) then
    raise exception 'FORBIDDEN';
  end if;

  if not exists (
    select 1 from public.patients p
    where p.id = v_patient and p.organization_id = v_org
  ) then
    raise exception 'PATIENT_INVALID';
  end if;

  insert into public.exam_orders (
    organization_id, practice_id, patient_id, title, status, clinical_status,
    source, observation, document_date, encounter_id, received_at, received_by,
    created_by
  ) values (
    v_org, v_practice, v_patient, v_title, 'received', 'DISPONIVEL_PARA_ANALISE',
    v_source, v_observation, v_document_date, v_encounter, now(),
    case when v_is_patient then null else auth.uid() end,
    auth.uid()
  )
  returning * into v_order;

  v_path := v_org::text || '/' || v_patient::text || '/' || v_order.id::text || '/' || v_upload_id::text || '/file';

  perform public.write_audit(
    'insert'::public.audit_action,
    'exam_orders',
    v_order.id,
    v_practice,
    v_patient,
    jsonb_build_object(
      'rpc', 'exam_order_submit',
      'event', 'EXAM_UPLOADED',
      'source', v_source,
      'upload_id', v_upload_id
    )
  );

  perform public.exam_notify_practice_physicians(
    v_org,
    v_practice,
    v_order.id,
    'Novo exame para análise',
    'Há um novo exame disponível para análise clínica.'
  );

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'upload_id', v_upload_id,
    'storage_path', v_path,
    'bucket', 'clinical-exams'
  );
end;
$$;

create or replace function public.exam_upload_register(p_payload jsonb)
returns public.exam_uploads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_upload_id uuid;
  v_path text;
  v_name text;
  v_mime text;
  v_size bigint;
  v_order public.exam_orders%rowtype;
  v_row public.exam_uploads%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  begin
    v_order_id := (p_payload->>'exam_order_id')::uuid;
    v_upload_id := (p_payload->>'upload_id')::uuid;
    v_size := nullif(p_payload->>'byte_size', '')::bigint;
  exception when others then
    raise exception 'EXAM_INVALID';
  end;

  v_path := nullif(p_payload->>'storage_path', '');
  v_name := coalesce(nullif(p_payload->>'original_name', ''), 'exame');
  v_mime := nullif(p_payload->>'mime_type', '');

  if v_order_id is null or v_upload_id is null or v_path is null then
    raise exception 'EXAM_INVALID';
  end if;

  select * into v_order from public.exam_orders where id = v_order_id for update;
  if not found then
    raise exception 'EXAM_NOT_FOUND';
  end if;

  if not (
    public.is_patient_self(v_order.patient_id)
    or public.is_house_ops(v_order.organization_id)
    or public.has_practice_role(v_order.practice_id, array['physician', 'secretary']::public.app_role[])
  ) then
    raise exception 'FORBIDDEN';
  end if;

  insert into public.exam_uploads (
    id, exam_order_id, organization_id, patient_id, practice_id,
    storage_path, original_name, mime_type, byte_size,
    uploaded_by, uploaded_by_patient
  ) values (
    v_upload_id, v_order.id, v_order.organization_id, v_order.patient_id, v_order.practice_id,
    v_path, v_name, v_mime, v_size,
    case when public.is_patient_self(v_order.patient_id) then null else auth.uid() end,
    public.is_patient_self(v_order.patient_id)
  )
  returning * into v_row;

  update public.exam_orders
     set clinical_status = 'DISPONIVEL_PARA_ANALISE',
         status = 'received',
         received_at = coalesce(received_at, now()),
         updated_at = now()
   where id = v_order.id;

  return v_row;
end;
$$;

create or replace function public.exam_mark_analyzed(p_payload jsonb)
returns public.exam_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_notes text;
  v_row public.exam_orders%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  begin
    v_id := (p_payload->>'exam_order_id')::uuid;
  exception when others then
    raise exception 'EXAM_INVALID';
  end;

  v_notes := nullif(btrim(coalesce(p_payload->>'analysis_notes', '')), '');

  select * into v_row from public.exam_orders where id = v_id for update;
  if not found then
    raise exception 'EXAM_NOT_FOUND';
  end if;

  if not public.can_write_clinical(v_row.practice_id) then
    raise exception 'FORBIDDEN';
  end if;

  if not public.has_practice_role(v_row.practice_id, array['physician']::public.app_role[]) then
    raise exception 'FORBIDDEN';
  end if;

  update public.exam_orders
     set clinical_status = 'ANALISADO',
         status = 'available',
         analysis_notes = coalesce(v_notes, analysis_notes),
         analyzed_at = now(),
         analyzed_by = auth.uid(),
         available_at = coalesce(available_at, now()),
         updated_at = now()
   where id = v_id
  returning * into v_row;

  perform public.write_audit(
    'update'::public.audit_action,
    'exam_orders',
    v_row.id,
    v_row.practice_id,
    v_row.patient_id,
    jsonb_build_object('rpc', 'exam_mark_analyzed', 'event', 'EXAM_ANALYZED')
  );

  return v_row;
end;
$$;

create or replace function public.exam_mark_in_analysis(p_exam_order_id uuid)
returns public.exam_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.exam_orders%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_row from public.exam_orders where id = p_exam_order_id for update;
  if not found then
    raise exception 'EXAM_NOT_FOUND';
  end if;

  if not public.can_write_clinical(v_row.practice_id) then
    raise exception 'FORBIDDEN';
  end if;

  update public.exam_orders
     set clinical_status = 'EM_ANALISE',
         updated_at = now()
   where id = p_exam_order_id
  returning * into v_row;

  perform public.write_audit(
    'read'::public.audit_action,
    'exam_orders',
    v_row.id,
    v_row.practice_id,
    v_row.patient_id,
    jsonb_build_object('rpc', 'exam_mark_in_analysis', 'event', 'EXAM_VIEWED')
  );

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) RPCs orientação: vincular exames + publish updates + feedback
-- ---------------------------------------------------------------------------

create or replace function public.clinical_orientation_link_exams(
  p_orientation_id uuid,
  p_exam_order_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o public.clinical_orientations%rowtype;
  v_exam uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_o from public.clinical_orientations where id = p_orientation_id for update;
  if not found then
    raise exception 'ORIENTATION_NOT_FOUND';
  end if;

  if not public.can_write_clinical(v_o.practice_id) then
    raise exception 'FORBIDDEN';
  end if;

  delete from public.clinical_orientation_exams where orientation_id = p_orientation_id;

  if p_exam_order_ids is null then
    return;
  end if;

  foreach v_exam in array p_exam_order_ids loop
    if not exists (
      select 1 from public.exam_orders e
      where e.id = v_exam
        and e.patient_id = v_o.patient_id
        and e.practice_id = v_o.practice_id
        and e.organization_id = v_o.organization_id
    ) then
      raise exception 'EXAM_INVALID';
    end if;

    insert into public.clinical_orientation_exams (
      orientation_id, exam_order_id, organization_id, practice_id, patient_id
    ) values (
      v_o.id, v_exam, v_o.organization_id, v_o.practice_id, v_o.patient_id
    );

    update public.exam_orders
       set clinical_status = case
             when clinical_status in ('ORIENTACAO_PUBLICADA') then clinical_status
             else 'ORIENTACAO_PENDENTE'
           end,
           updated_at = now()
     where id = v_exam;
  end loop;

  if coalesce(array_length(p_exam_order_ids, 1), 0) > 0 then
    update public.clinical_orientations
       set primary_exam_order_id = p_exam_order_ids[1],
           updated_at = now()
     where id = p_orientation_id;
  end if;
end;
$$;

-- Patch publish to mark linked exams + support AUDIO_ONLY (redefine)
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

  if coalesce(v_row.reviewed_confirmed, false) is not true then
    raise exception 'ORIENTATION_NOT_REVIEWED';
  end if;

  if v_row.delivery_mode is null then
    raise exception 'ORIENTATION_DELIVERY_REQUIRED';
  end if;

  if v_row.delivery_mode in ('TEXT_ONLY', 'TEXT_AND_AUDIO')
     and (v_row.final_text is null or btrim(v_row.final_text) = '') then
    raise exception 'ORIENTATION_TEXT_REQUIRED';
  end if;

  if v_row.delivery_mode in ('AUDIO_ONLY', 'TEXT_AND_AUDIO')
     and v_row.audio_storage_path is null then
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

  update public.exam_orders e
     set clinical_status = 'ORIENTACAO_PUBLICADA',
         updated_at = now()
    from public.clinical_orientation_exams x
   where x.orientation_id = v_row.orientation_id
     and x.exam_order_id = e.id;

  perform public.clinical_orientation_notify_patient(
    v_row.organization_id,
    v_row.practice_id,
    v_row.patient_id,
    v_row.orientation_id
  );

  perform public.write_audit(
    'update'::public.audit_action,
    'clinical_orientation_versions',
    v_row.id,
    v_row.practice_id,
    v_row.patient_id,
    jsonb_build_object(
      'rpc', 'clinical_orientation_publish',
      'event', 'ORIENTATION_PUBLISHED',
      'delivery_mode', v_row.delivery_mode
    )
  );

  return v_row;
end;
$$;

create or replace function public.orientation_feedback_submit(p_payload jsonb)
returns public.orientation_feedback
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orientation_id uuid;
  v_version_id uuid;
  v_kind text;
  v_message text;
  v_o public.clinical_orientations%rowtype;
  v_v public.clinical_orientation_versions%rowtype;
  v_row public.orientation_feedback%rowtype;
  v_profile uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  begin
    v_orientation_id := (p_payload->>'orientation_id')::uuid;
    v_version_id := (p_payload->>'orientation_version_id')::uuid;
  exception when others then
    raise exception 'FEEDBACK_INVALID';
  end;

  v_kind := p_payload->>'kind';
  v_message := nullif(btrim(coalesce(p_payload->>'message', '')), '');

  if v_kind not in ('understood', 'clarification_request') then
    raise exception 'FEEDBACK_INVALID';
  end if;

  select * into v_o from public.clinical_orientations where id = v_orientation_id;
  if not found then
    raise exception 'ORIENTATION_NOT_FOUND';
  end if;

  if not public.is_patient_self(v_o.patient_id) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_v from public.clinical_orientation_versions where id = v_version_id;
  if not found or v_v.orientation_id <> v_o.id or v_v.status <> 'published' then
    raise exception 'ORIENTATION_NOT_PUBLISHED';
  end if;

  if v_o.current_published_version_id is distinct from v_v.id then
    raise exception 'ORIENTATION_NOT_CURRENT';
  end if;

  insert into public.orientation_feedback (
    organization_id, practice_id, patient_id, orientation_id, orientation_version_id,
    kind, message, status
  ) values (
    v_o.organization_id, v_o.practice_id, v_o.patient_id, v_o.id, v_v.id,
    v_kind, v_message,
    case when v_kind = 'understood' then 'closed' else 'open' end
  )
  returning * into v_row;

  if v_kind = 'clarification_request' then
    for v_profile in
      select distinct upr.user_id
      from public.user_practice_roles upr
      where upr.practice_id = v_o.practice_id
        and upr.role = 'physician'
    loop
      insert into public.staff_notifications (
        organization_id, practice_id, recipient_profile_id,
        event_type, title, message, reference_type, reference_id
      ) values (
        v_o.organization_id, v_o.practice_id, v_profile,
        'orientation_clarification_requested',
        'Solicitação de nova orientação',
        'A paciente solicitou esclarecimento sobre uma orientação publicada.',
        'orientation_feedback', v_row.id
      );
    end loop;
  end if;

  perform public.write_audit(
    'insert'::public.audit_action,
    'orientation_feedback',
    v_row.id,
    v_o.practice_id,
    v_o.patient_id,
    jsonb_build_object(
      'rpc', 'orientation_feedback_submit',
      'event', case when v_kind = 'understood' then 'PATIENT_FEEDBACK' else 'NEW_GUIDANCE_REQUESTED' end,
      'kind', v_kind
    )
  );

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9) Receita: publicar para paciente (dispatch) a partir do fluxo clínico
-- ---------------------------------------------------------------------------

create or replace function public.prescription_publish_to_patient(p_prescription_id uuid)
returns public.prescriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.prescriptions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_row from public.prescriptions where id = p_prescription_id for update;
  if not found then
    raise exception 'PRESCRIPTION_NOT_FOUND';
  end if;

  if not public.can_sign_prescription(v_row.practice_id) then
    raise exception 'FORBIDDEN';
  end if;

  if v_row.status = 'cancelled' then
    raise exception 'PRESCRIPTION_INVALID_STATUS';
  end if;

  if v_row.status = 'draft' then
    if not exists (
      select 1 from public.prescription_items i where i.prescription_id = v_row.id
    ) then
      raise exception 'PRESCRIPTION_EMPTY';
    end if;
  end if;

  update public.prescriptions
     set status = 'dispatched',
         signed_at = coalesce(signed_at, now()),
         signed_by = coalesce(signed_by, auth.uid()),
         dispatched_at = coalesce(dispatched_at, now()),
         dispatched_by = coalesce(dispatched_by, auth.uid()),
         published_to_patient_at = coalesce(published_to_patient_at, now()),
         delivery_channel = coalesce(delivery_channel, 'patient_portal')
   where id = p_prescription_id
  returning * into v_row;

  insert into public.patient_notifications (
    organization_id, practice_id, patient_id, recipient_user_id,
    event_type, title, message, reference_type, reference_id
  )
  select
    v_row.organization_id,
    v_row.practice_id,
    v_row.patient_id,
    pa.user_id,
    'prescription_published',
    'Nova receita disponível',
    'Sua médica disponibilizou uma receita no aplicativo.',
    'prescription',
    v_row.id
  from public.patient_accounts pa
  where pa.patient_id = v_row.patient_id
    and not exists (
      select 1 from public.patient_notifications n
      where n.reference_id = v_row.id
        and n.event_type = 'prescription_published'
        and n.dismissed_at is null
    );

  perform public.write_audit(
    'update'::public.audit_action,
    'prescriptions',
    v_row.id,
    v_row.practice_id,
    v_row.patient_id,
    jsonb_build_object('rpc', 'prescription_publish_to_patient', 'event', 'RECIPE_PUBLISHED')
  );

  return v_row;
end;
$$;

create or replace function public.prescription_mark_viewed(p_prescription_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.prescriptions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_row from public.prescriptions where id = p_prescription_id for update;
  if not found then
    raise exception 'PRESCRIPTION_NOT_FOUND';
  end if;

  if not public.is_patient_self(v_row.patient_id) then
    raise exception 'FORBIDDEN';
  end if;

  if v_row.status not in ('signed', 'dispatched') then
    raise exception 'PRESCRIPTION_NOT_AVAILABLE';
  end if;

  if v_row.viewed_by_patient_at is null then
    update public.prescriptions
       set viewed_by_patient_at = now()
     where id = p_prescription_id
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'viewed_by_patient_at', v_row.viewed_by_patient_at,
    'status', v_row.status
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 10) Grants
-- ---------------------------------------------------------------------------

revoke all on function public.exam_order_submit(jsonb) from public, anon;
revoke all on function public.exam_upload_register(jsonb) from public, anon;
revoke all on function public.exam_mark_analyzed(jsonb) from public, anon;
revoke all on function public.exam_mark_in_analysis(uuid) from public, anon;
revoke all on function public.clinical_orientation_link_exams(uuid, uuid[]) from public, anon;
revoke all on function public.orientation_feedback_submit(jsonb) from public, anon;
revoke all on function public.prescription_publish_to_patient(uuid) from public, anon;
revoke all on function public.prescription_mark_viewed(uuid) from public, anon;

grant execute on function public.exam_order_submit(jsonb) to authenticated;
grant execute on function public.exam_upload_register(jsonb) to authenticated;
grant execute on function public.exam_mark_analyzed(jsonb) to authenticated;
grant execute on function public.exam_mark_in_analysis(uuid) to authenticated;
grant execute on function public.clinical_orientation_link_exams(uuid, uuid[]) to authenticated;
grant execute on function public.orientation_feedback_submit(jsonb) to authenticated;
grant execute on function public.prescription_publish_to_patient(uuid) to authenticated;
grant execute on function public.prescription_mark_viewed(uuid) to authenticated;
