-- C040.7 — Documentos clínicos (artefatos), integridade e entrega controlada
-- Não destrutiva. Não altera actual_end / starts_at / scheduled_*.
-- Distingue: registro clínico ≠ documento médico ≠ assinatura digital qualificada.
-- Assinatura neste módulo = validação interna do sistema (signature_kind = internal_system).
-- NÃO declara ICP-Brasil / assinatura digital qualificada.

create extension if not exists pgcrypto with schema extensions;

-- ============================================================================
-- 1) Identidade profissional (campos opcionais — sem valores fictícios)
-- ============================================================================

alter table public.professionals
  add column if not exists council_uf char(2),
  add column if not exists rqe_number text,
  add column if not exists professional_phone text,
  add column if not exists professional_email citext,
  add column if not exists professional_address text;

comment on column public.professionals.council_uf is
  'UF do conselho (ex.: SP). Opcional; necessário para documento completo.';
comment on column public.professionals.rqe_number is
  'RQE quando houver. Opcional; não inventar.';
comment on column public.professionals.professional_address is
  'Endereço profissional para documentos. Opcional.';

-- Indicação clínica no pedido de exames (texto livre)
alter table public.clinical_exam_requests
  add column if not exists clinical_indication text;

comment on column public.clinical_exam_requests.clinical_indication is
  'Indicação clínica do pedido — congelada no artefato ao emitir documento.';

-- ============================================================================
-- 2) Artefatos documentais (ponteiros; fontes de verdade permanecem nas tabelas de domínio)
-- ============================================================================

create table if not exists public.clinical_document_artifacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  patient_id uuid not null references public.patients (id),
  encounter_id uuid references public.encounters (id),
  professional_id uuid not null references public.professionals (id),
  source_type text not null
    check (source_type in ('prescription', 'exam_request', 'orientation')),
  source_id uuid not null,
  document_kind text not null
    check (document_kind in ('receita', 'solicitacao_exames', 'orientacao')),
  version integer not null default 1 check (version >= 1),
  status text not null default 'finalized'
    check (status in ('finalized', 'superseded', 'cancelled')),
  title text not null,
  issued_at timestamptz not null default now(),
  frozen_payload jsonb not null,
  content_sha256 text not null,
  pdf_storage_path text,
  pdf_sha256 text,
  signature_kind text not null default 'internal_system'
    check (signature_kind in ('internal_system')),
  signed_at timestamptz not null default now(),
  signed_by uuid not null references public.profiles (id),
  available_to_patient boolean not null default false,
  published_to_patient_at timestamptz,
  viewed_by_patient_at timestamptz,
  supersedes_id uuid references public.clinical_document_artifacts (id),
  correction_reason text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (source_type, source_id, version)
);

create index if not exists clinical_document_artifacts_encounter_idx
  on public.clinical_document_artifacts (encounter_id, issued_at desc);
create index if not exists clinical_document_artifacts_patient_idx
  on public.clinical_document_artifacts (patient_id, issued_at desc)
  where available_to_patient = true;
create index if not exists clinical_document_artifacts_practice_idx
  on public.clinical_document_artifacts (practice_id, issued_at desc);
create index if not exists clinical_document_artifacts_source_idx
  on public.clinical_document_artifacts (source_type, source_id);

comment on table public.clinical_document_artifacts is
  'C040.7: documento médico emitido (snapshot imutável). signature_kind=internal_system NÃO é assinatura digital ICP-Brasil.';
comment on column public.clinical_document_artifacts.frozen_payload is
  'Snapshot canônico do conteúdo emitido (paciente, profissional, itens).';
comment on column public.clinical_document_artifacts.content_sha256 is
  'SHA-256 hex do frozen_payload canônico. Integridade técnica ≠ assinatura digital.';
comment on column public.clinical_document_artifacts.signature_kind is
  'Somente internal_system nesta etapa. Preparado para futuro qualified sem simulação.';

revoke all on table public.clinical_document_artifacts from public, anon, authenticated;
grant select on table public.clinical_document_artifacts to authenticated;

alter table public.clinical_document_artifacts enable row level security;

drop policy if exists clinical_document_artifacts_physician_select on public.clinical_document_artifacts;
create policy clinical_document_artifacts_physician_select on public.clinical_document_artifacts
  for select to authenticated
  using (public.can_read_clinical(practice_id, patient_id, professional_id));

drop policy if exists clinical_document_artifacts_patient_select on public.clinical_document_artifacts;
create policy clinical_document_artifacts_patient_select on public.clinical_document_artifacts
  for select to authenticated
  using (
    available_to_patient = true
    and status = 'finalized'
    and public.is_patient_self(patient_id)
  );

-- Imutabilidade: bloquear UPDATE de conteúdo após emissão
create or replace function public.clinical_document_artifacts_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if old.status = 'finalized'
       and (
         new.frozen_payload is distinct from old.frozen_payload
         or new.content_sha256 is distinct from old.content_sha256
         or new.source_id is distinct from old.source_id
         or new.source_type is distinct from old.source_type
         or new.patient_id is distinct from old.patient_id
         or new.encounter_id is distinct from old.encounter_id
         or new.professional_id is distinct from old.professional_id
         or new.document_kind is distinct from old.document_kind
         or new.version is distinct from old.version
         or new.signature_kind is distinct from old.signature_kind
         or new.signed_at is distinct from old.signed_at
         or new.signed_by is distinct from old.signed_by
         or (new.pdf_storage_path is distinct from old.pdf_storage_path
             and old.pdf_storage_path is not null)
         or (new.pdf_sha256 is distinct from old.pdf_sha256
             and old.pdf_sha256 is not null)
       ) then
      raise exception 'DOCUMENT_IMMUTABLE';
    end if;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'DOCUMENT_DELETE_FORBIDDEN';
  end if;
  return new;
end;
$$;

drop trigger if exists clinical_document_artifacts_before_write on public.clinical_document_artifacts;
create trigger clinical_document_artifacts_before_write
  before update or delete
  on public.clinical_document_artifacts
  for each row execute function public.clinical_document_artifacts_before_write();

-- ============================================================================
-- 3) Storage privado
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clinical-documents',
  'clinical-documents',
  false,
  20971520,
  array['application/pdf']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path: {organization_id}/{practice_id}/{patient_id}/{document_id}/document.pdf
create or replace function public.clinical_document_path_ids(object_name text)
returns table (
  organization_id uuid,
  practice_id uuid,
  patient_id uuid,
  document_id uuid
)
language plpgsql
immutable
as $$
declare
  parts text[];
begin
  parts := string_to_array(object_name, '/');
  if array_length(parts, 1) < 5 then
    return;
  end if;
  begin
    organization_id := parts[1]::uuid;
    practice_id := parts[2]::uuid;
    patient_id := parts[3]::uuid;
    document_id := parts[4]::uuid;
  exception when others then
    return;
  end;
  return next;
end;
$$;

drop policy if exists clinical_documents_storage_select on storage.objects;
create policy clinical_documents_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'clinical-documents'
    and exists (
      select 1
      from public.clinical_document_path_ids(name) ids
      join public.clinical_document_artifacts d on d.id = ids.document_id
      where d.organization_id = ids.organization_id
        and d.practice_id = ids.practice_id
        and d.patient_id = ids.patient_id
        and (
          public.can_read_clinical(d.practice_id, d.patient_id, d.professional_id)
          or (d.available_to_patient and public.is_patient_self(d.patient_id))
        )
    )
  );

drop policy if exists clinical_documents_storage_insert on storage.objects;
create policy clinical_documents_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'clinical-documents'
    and exists (
      select 1
      from public.clinical_document_path_ids(name) ids
      join public.clinical_document_artifacts d on d.id = ids.document_id
      where d.organization_id = ids.organization_id
        and d.practice_id = ids.practice_id
        and d.patient_id = ids.patient_id
        and d.pdf_storage_path is null
        and public.can_write_clinical(d.practice_id)
        and exists (
          select 1 from public.professionals pr
          where pr.id = d.professional_id
            and pr.profile_id = auth.uid()
            and pr.practice_id = d.practice_id
        )
    )
  );

-- ============================================================================
-- 4) Helpers
-- ============================================================================

create or replace function public.clinical_document_canonical_hash(p_payload jsonb)
returns text
language sql
immutable
as $$
  select encode(extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'::text), 'hex');
$$;

-- Bloquear mutação de itens de pedido se já houver documento finalizado
create or replace function public.clinical_exam_request_items_document_guard()
returns trigger
language plpgsql
as $$
declare
  v_req_id uuid;
begin
  v_req_id := coalesce(new.request_id, old.request_id);
  if exists (
    select 1 from public.clinical_document_artifacts d
    where d.source_type = 'exam_request'
      and d.source_id = v_req_id
      and d.status = 'finalized'
  ) then
    raise exception 'DOCUMENT_IMMUTABLE';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists clinical_exam_request_items_document_guard on public.clinical_exam_request_items;
create trigger clinical_exam_request_items_document_guard
  before insert or update or delete
  on public.clinical_exam_request_items
  for each row execute function public.clinical_exam_request_items_document_guard();

-- ============================================================================
-- 5) RPC: emitir documento a partir de receita
-- ============================================================================

create or replace function public.clinical_document_issue_from_prescription(
  p_prescription_id uuid,
  p_share_with_patient boolean default true,
  p_supersedes_id uuid default null,
  p_correction_reason text default null
)
returns public.clinical_document_artifacts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rx public.prescriptions%rowtype;
  v_patient public.patients%rowtype;
  v_prof public.professionals%rowtype;
  v_profile public.profiles%rowtype;
  v_practice public.practice_units%rowtype;
  v_items jsonb;
  v_payload jsonb;
  v_hash text;
  v_version int;
  v_doc public.clinical_document_artifacts%rowtype;
  v_prev public.clinical_document_artifacts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_rx from public.prescriptions where id = p_prescription_id for update;
  if not found then
    raise exception 'PRESCRIPTION_NOT_FOUND';
  end if;

  if not public.can_sign_prescription(v_rx.practice_id) then
    raise exception 'FORBIDDEN';
  end if;

  if not exists (
    select 1 from public.professionals pr
    where pr.id = v_rx.professional_id
      and pr.profile_id = auth.uid()
      and pr.practice_id = v_rx.practice_id
  ) then
    raise exception 'PROFESSIONAL_MISMATCH';
  end if;

  if v_rx.status = 'cancelled' then
    raise exception 'PRESCRIPTION_INVALID_STATUS';
  end if;

  if not exists (select 1 from public.prescription_items i where i.prescription_id = v_rx.id) then
    raise exception 'PRESCRIPTION_EMPTY';
  end if;

  if exists (
    select 1 from public.clinical_document_artifacts d
    where d.source_type = 'prescription'
      and d.source_id = v_rx.id
      and d.status = 'finalized'
  ) and p_supersedes_id is null then
    raise exception 'DOCUMENT_ALREADY_ISSUED';
  end if;

  if p_supersedes_id is not null then
    select * into v_prev from public.clinical_document_artifacts where id = p_supersedes_id for update;
    if not found
       or v_prev.patient_id is distinct from v_rx.patient_id
       or v_prev.practice_id is distinct from v_rx.practice_id
       or v_prev.source_type is distinct from 'prescription'
       or v_prev.status is distinct from 'finalized' then
      raise exception 'DOCUMENT_SUPERSEDE_INVALID';
    end if;
    if coalesce(nullif(btrim(p_correction_reason), ''), '') = '' then
      raise exception 'CORRECTION_REASON_REQUIRED';
    end if;
  end if;

  select * into v_patient from public.patients where id = v_rx.patient_id;
  select * into v_prof from public.professionals where id = v_rx.professional_id;
  select * into v_profile from public.profiles where id = v_prof.profile_id;
  select * into v_practice from public.practice_units where id = v_rx.practice_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'medication_name', i.medication_name,
      'presentation', i.presentation,
      'quantity', i.quantity,
      'dosage', i.dosage,
      'frequency', i.frequency,
      'duration', i.duration,
      'route', i.route,
      'instructions', i.instructions,
      'sort_order', i.sort_order
    ) order by i.sort_order, i.medication_name
  ), '[]'::jsonb)
  into v_items
  from public.prescription_items i
  where i.prescription_id = v_rx.id;

  v_payload := jsonb_build_object(
    'document_kind', 'receita',
    'issued_at', to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'signature_kind', 'internal_system',
    'signature_disclaimer', 'Validacao interna do sistema — nao constitui assinatura digital qualificada ICP-Brasil.',
    'patient', jsonb_build_object(
      'id', v_patient.id,
      'full_name', v_patient.full_name,
      'cpf', v_patient.cpf,
      'birth_date', v_patient.birth_date
    ),
    'professional', jsonb_build_object(
      'id', v_prof.id,
      'full_name', v_profile.full_name,
      'council_type', v_prof.council_type,
      'council_number', v_prof.council_number,
      'council_uf', v_prof.council_uf,
      'rqe_number', v_prof.rqe_number,
      'phone', v_prof.professional_phone,
      'email', v_prof.professional_email,
      'address', v_prof.professional_address
    ),
    'practice', jsonb_build_object(
      'id', v_practice.id,
      'name', v_practice.name
    ),
    'prescription', jsonb_build_object(
      'id', v_rx.id,
      'encounter_id', v_rx.encounter_id,
      'notes', v_rx.notes,
      'items', v_items
    )
  );

  v_hash := public.clinical_document_canonical_hash(v_payload);

  select coalesce(max(version), 0) + 1 into v_version
  from public.clinical_document_artifacts
  where source_type = 'prescription' and source_id = v_rx.id;

  if p_supersedes_id is not null then
    update public.clinical_document_artifacts
       set status = 'superseded'
     where id = p_supersedes_id;
  end if;

  -- Congela receita no fluxo portal (mantém publish existente)
  update public.prescriptions
     set status = 'dispatched',
         signed_at = coalesce(signed_at, now()),
         signed_by = coalesce(signed_by, auth.uid()),
         dispatched_at = coalesce(dispatched_at, now()),
         dispatched_by = coalesce(dispatched_by, auth.uid()),
         published_to_patient_at = case
           when p_share_with_patient then coalesce(published_to_patient_at, now())
           else published_to_patient_at
         end,
         delivery_channel = case
           when p_share_with_patient then coalesce(delivery_channel, 'patient_portal')
           else delivery_channel
         end
   where id = v_rx.id;

  insert into public.clinical_document_artifacts (
    organization_id, practice_id, patient_id, encounter_id, professional_id,
    source_type, source_id, document_kind, version, status, title,
    frozen_payload, content_sha256, signature_kind, signed_at, signed_by,
    available_to_patient, published_to_patient_at,
    supersedes_id, correction_reason, created_by
  ) values (
    v_rx.organization_id, v_rx.practice_id, v_rx.patient_id, v_rx.encounter_id, v_rx.professional_id,
    'prescription', v_rx.id, 'receita', v_version, 'finalized',
    'Receita médica',
    v_payload, v_hash, 'internal_system', now(), auth.uid(),
    coalesce(p_share_with_patient, false),
    case when p_share_with_patient then now() else null end,
    p_supersedes_id, nullif(btrim(coalesce(p_correction_reason, '')), ''),
    auth.uid()
  ) returning * into v_doc;

  if p_share_with_patient then
    insert into public.patient_notifications (
      organization_id, practice_id, patient_id, recipient_user_id,
      event_type, title, message, reference_type, reference_id
    )
    select
      v_doc.organization_id, v_doc.practice_id, v_doc.patient_id, pa.user_id,
      'clinical_document_published',
      'Novo documento disponível',
      'Sua médica disponibilizou um documento no aplicativo.',
      'clinical_document',
      v_doc.id
    from public.patient_accounts pa
    where pa.patient_id = v_doc.patient_id
      and not exists (
        select 1 from public.patient_notifications n
        where n.reference_id = v_doc.id
          and n.event_type = 'clinical_document_published'
          and n.dismissed_at is null
      );
  end if;

  perform public.write_audit(
    'insert'::public.audit_action,
    'clinical_document_artifacts',
    v_doc.id,
    v_doc.practice_id,
    v_doc.patient_id,
    jsonb_build_object(
      'rpc', 'clinical_document_issue_from_prescription',
      'event', 'DOCUMENT_FINALIZED',
      'source_type', 'prescription',
      'source_id', v_rx.id,
      'content_sha256', v_hash,
      'signature_kind', 'internal_system',
      'available_to_patient', p_share_with_patient,
      'supersedes_id', p_supersedes_id
    )
  );

  return v_doc;
end;
$$;

-- ============================================================================
-- 6) RPC: emitir documento a partir de pedido de exames
-- ============================================================================

create or replace function public.clinical_document_issue_from_exam_request(
  p_request_id uuid,
  p_clinical_indication text default null,
  p_share_with_patient boolean default false,
  p_supersedes_id uuid default null,
  p_correction_reason text default null
)
returns public.clinical_document_artifacts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.clinical_exam_requests%rowtype;
  v_patient public.patients%rowtype;
  v_prof public.professionals%rowtype;
  v_profile public.profiles%rowtype;
  v_practice public.practice_units%rowtype;
  v_items jsonb;
  v_payload jsonb;
  v_hash text;
  v_version int;
  v_doc public.clinical_document_artifacts%rowtype;
  v_prev public.clinical_document_artifacts%rowtype;
  v_indication text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_req from public.clinical_exam_requests where id = p_request_id for update;
  if not found then
    raise exception 'EXAM_REQUEST_NOT_FOUND';
  end if;

  if not public.can_write_clinical(v_req.practice_id) then
    raise exception 'FORBIDDEN';
  end if;

  if not exists (
    select 1 from public.professionals pr
    where pr.id = v_req.professional_id
      and pr.profile_id = auth.uid()
      and pr.practice_id = v_req.practice_id
  ) then
    raise exception 'PROFESSIONAL_MISMATCH';
  end if;

  if v_req.status = 'cancelled' then
    raise exception 'EXAM_REQUEST_INVALID_STATUS';
  end if;

  if not exists (select 1 from public.clinical_exam_request_items i where i.request_id = v_req.id) then
    raise exception 'EXAM_REQUEST_EMPTY';
  end if;

  if exists (
    select 1 from public.clinical_document_artifacts d
    where d.source_type = 'exam_request'
      and d.source_id = v_req.id
      and d.status = 'finalized'
  ) and p_supersedes_id is null then
    raise exception 'DOCUMENT_ALREADY_ISSUED';
  end if;

  if p_supersedes_id is not null then
    select * into v_prev from public.clinical_document_artifacts where id = p_supersedes_id for update;
    if not found
       or v_prev.source_type is distinct from 'exam_request'
       or v_prev.patient_id is distinct from v_req.patient_id
       or v_prev.status is distinct from 'finalized' then
      raise exception 'DOCUMENT_SUPERSEDE_INVALID';
    end if;
    if coalesce(nullif(btrim(p_correction_reason), ''), '') = '' then
      raise exception 'CORRECTION_REASON_REQUIRED';
    end if;
  end if;

  v_indication := coalesce(
    nullif(btrim(coalesce(p_clinical_indication, '')), ''),
    nullif(btrim(coalesce(v_req.clinical_indication, '')), ''),
    nullif(btrim(coalesce(v_req.notes, '')), '')
  );

  update public.clinical_exam_requests
     set status = 'confirmed',
         confirmed_at = coalesce(confirmed_at, now()),
         clinical_indication = coalesce(clinical_indication, v_indication),
         updated_at = now()
   where id = v_req.id
  returning * into v_req;

  select * into v_patient from public.patients where id = v_req.patient_id;
  select * into v_prof from public.professionals where id = v_req.professional_id;
  select * into v_profile from public.profiles where id = v_prof.profile_id;
  select * into v_practice from public.practice_units where id = v_req.practice_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'catalog_id', i.catalog_id,
      'group_id', i.group_id,
      'name', coalesce(c.name, i.custom_name, 'Exame'),
      'custom_name', i.custom_name,
      'sort_order', i.sort_order
    ) order by i.sort_order
  ), '[]'::jsonb)
  into v_items
  from public.clinical_exam_request_items i
  left join public.clinical_exam_catalog c on c.id = i.catalog_id
  where i.request_id = v_req.id;

  v_payload := jsonb_build_object(
    'document_kind', 'solicitacao_exames',
    'issued_at', to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'signature_kind', 'internal_system',
    'signature_disclaimer', 'Validacao interna do sistema — nao constitui assinatura digital qualificada ICP-Brasil.',
    'patient', jsonb_build_object(
      'id', v_patient.id,
      'full_name', v_patient.full_name,
      'cpf', v_patient.cpf,
      'birth_date', v_patient.birth_date
    ),
    'professional', jsonb_build_object(
      'id', v_prof.id,
      'full_name', v_profile.full_name,
      'council_type', v_prof.council_type,
      'council_number', v_prof.council_number,
      'council_uf', v_prof.council_uf,
      'rqe_number', v_prof.rqe_number,
      'phone', v_prof.professional_phone,
      'email', v_prof.professional_email,
      'address', v_prof.professional_address
    ),
    'practice', jsonb_build_object(
      'id', v_practice.id,
      'name', v_practice.name
    ),
    'exam_request', jsonb_build_object(
      'id', v_req.id,
      'encounter_id', v_req.encounter_id,
      'clinical_indication', v_indication,
      'notes', v_req.notes,
      'items', v_items
    )
  );

  v_hash := public.clinical_document_canonical_hash(v_payload);

  select coalesce(max(version), 0) + 1 into v_version
  from public.clinical_document_artifacts
  where source_type = 'exam_request' and source_id = v_req.id;

  if p_supersedes_id is not null then
    update public.clinical_document_artifacts
       set status = 'superseded'
     where id = p_supersedes_id;
  end if;

  insert into public.clinical_document_artifacts (
    organization_id, practice_id, patient_id, encounter_id, professional_id,
    source_type, source_id, document_kind, version, status, title,
    frozen_payload, content_sha256, signature_kind, signed_at, signed_by,
    available_to_patient, published_to_patient_at,
    supersedes_id, correction_reason, created_by
  ) values (
    v_req.organization_id, v_req.practice_id, v_req.patient_id, v_req.encounter_id, v_req.professional_id,
    'exam_request', v_req.id, 'solicitacao_exames', v_version, 'finalized',
    'Solicitação de exames',
    v_payload, v_hash, 'internal_system', now(), auth.uid(),
    coalesce(p_share_with_patient, false),
    case when p_share_with_patient then now() else null end,
    p_supersedes_id, nullif(btrim(coalesce(p_correction_reason, '')), ''),
    auth.uid()
  ) returning * into v_doc;

  if p_share_with_patient then
    insert into public.patient_notifications (
      organization_id, practice_id, patient_id, recipient_user_id,
      event_type, title, message, reference_type, reference_id
    )
    select
      v_doc.organization_id, v_doc.practice_id, v_doc.patient_id, pa.user_id,
      'clinical_document_published',
      'Nova solicitação de exames',
      'Sua médica disponibilizou uma solicitação de exames no aplicativo.',
      'clinical_document',
      v_doc.id
    from public.patient_accounts pa
    where pa.patient_id = v_doc.patient_id;
  end if;

  perform public.write_audit(
    'insert'::public.audit_action,
    'clinical_document_artifacts',
    v_doc.id,
    v_doc.practice_id,
    v_doc.patient_id,
    jsonb_build_object(
      'rpc', 'clinical_document_issue_from_exam_request',
      'event', 'DOCUMENT_FINALIZED',
      'source_type', 'exam_request',
      'source_id', v_req.id,
      'content_sha256', v_hash,
      'signature_kind', 'internal_system',
      'available_to_patient', p_share_with_patient
    )
  );

  return v_doc;
end;
$$;

-- ============================================================================
-- 7) Listagens / attach PDF / view / correction marker
-- ============================================================================

create or replace function public.clinical_document_list_for_encounter(p_encounter_id uuid)
returns setof public.clinical_document_artifacts
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

  select * into v_enc from public.encounters where id = p_encounter_id;
  if not found then
    raise exception 'ENCOUNTER_NOT_FOUND';
  end if;

  if not public.can_read_clinical(v_enc.practice_id, v_enc.patient_id, v_enc.professional_id) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select d.*
  from public.clinical_document_artifacts d
  where d.encounter_id = p_encounter_id
  order by d.issued_at desc, d.version desc;
end;
$$;

create or replace function public.clinical_document_list_for_patient_portal()
returns setof public.clinical_document_artifacts
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  return query
  select d.*
  from public.clinical_document_artifacts d
  where d.available_to_patient = true
    and d.status = 'finalized'
    and public.is_patient_self(d.patient_id)
  order by d.issued_at desc;
end;
$$;

create or replace function public.clinical_document_attach_pdf(
  p_document_id uuid,
  p_storage_path text,
  p_pdf_sha256 text
)
returns public.clinical_document_artifacts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.clinical_document_artifacts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_doc from public.clinical_document_artifacts where id = p_document_id for update;
  if not found then
    raise exception 'DOCUMENT_NOT_FOUND';
  end if;

  if v_doc.status is distinct from 'finalized' then
    raise exception 'DOCUMENT_NOT_FINALIZED';
  end if;

  if not public.can_write_clinical(v_doc.practice_id) then
    raise exception 'FORBIDDEN';
  end if;

  if not exists (
    select 1 from public.professionals pr
    where pr.id = v_doc.professional_id
      and pr.profile_id = auth.uid()
  ) then
    raise exception 'PROFESSIONAL_MISMATCH';
  end if;

  if v_doc.pdf_storage_path is not null then
    raise exception 'DOCUMENT_PDF_ALREADY_ATTACHED';
  end if;

  if coalesce(nullif(btrim(p_storage_path), ''), '') = ''
     or coalesce(nullif(btrim(p_pdf_sha256), ''), '') = '' then
    raise exception 'DOCUMENT_PDF_INVALID';
  end if;

  -- Path must match org/practice/patient/document
  if p_storage_path is distinct from (
    v_doc.organization_id::text || '/' ||
    v_doc.practice_id::text || '/' ||
    v_doc.patient_id::text || '/' ||
    v_doc.id::text || '/document.pdf'
  ) then
    raise exception 'DOCUMENT_PDF_PATH_INVALID';
  end if;

  update public.clinical_document_artifacts
     set pdf_storage_path = p_storage_path,
         pdf_sha256 = lower(p_pdf_sha256)
   where id = v_doc.id
  returning * into v_doc;

  perform public.write_audit(
    'update'::public.audit_action,
    'clinical_document_artifacts',
    v_doc.id,
    v_doc.practice_id,
    v_doc.patient_id,
    jsonb_build_object(
      'rpc', 'clinical_document_attach_pdf',
      'event', 'DOCUMENT_PDF_ATTACHED',
      'pdf_sha256', v_doc.pdf_sha256
    )
  );

  return v_doc;
end;
$$;

create or replace function public.clinical_document_mark_viewed(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.clinical_document_artifacts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_doc from public.clinical_document_artifacts where id = p_document_id for update;
  if not found then
    raise exception 'DOCUMENT_NOT_FOUND';
  end if;

  if not v_doc.available_to_patient or v_doc.status is distinct from 'finalized' then
    raise exception 'FORBIDDEN';
  end if;

  if not public.is_patient_self(v_doc.patient_id) then
    raise exception 'FORBIDDEN';
  end if;

  update public.clinical_document_artifacts
     set viewed_by_patient_at = coalesce(viewed_by_patient_at, now())
   where id = v_doc.id
  returning * into v_doc;

  perform public.write_audit(
    'update'::public.audit_action,
    'clinical_document_artifacts',
    v_doc.id,
    v_doc.practice_id,
    v_doc.patient_id,
    jsonb_build_object(
      'rpc', 'clinical_document_mark_viewed',
      'event', 'DOCUMENT_VIEWED'
    )
  );

  return jsonb_build_object(
    'id', v_doc.id,
    'viewed_by_patient_at', v_doc.viewed_by_patient_at
  );
end;
$$;

create or replace function public.clinical_document_audit_download(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.clinical_document_artifacts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_doc from public.clinical_document_artifacts where id = p_document_id;
  if not found then
    raise exception 'DOCUMENT_NOT_FOUND';
  end if;

  if not (
    public.can_read_clinical(v_doc.practice_id, v_doc.patient_id, v_doc.professional_id)
    or (v_doc.available_to_patient and public.is_patient_self(v_doc.patient_id))
  ) then
    raise exception 'FORBIDDEN';
  end if;

  perform public.write_audit(
    'export'::public.audit_action,
    'clinical_document_artifacts',
    v_doc.id,
    v_doc.practice_id,
    v_doc.patient_id,
    jsonb_build_object(
      'rpc', 'clinical_document_audit_download',
      'event', 'DOCUMENT_DOWNLOADED'
    )
  );

  return jsonb_build_object('ok', true, 'id', v_doc.id);
end;
$$;

-- ============================================================================
-- 8) Grants
-- ============================================================================

revoke all on function public.clinical_document_canonical_hash(jsonb) from public, anon;
grant execute on function public.clinical_document_canonical_hash(jsonb) to authenticated;

revoke all on function public.clinical_document_issue_from_prescription(uuid, boolean, uuid, text) from public, anon;
grant execute on function public.clinical_document_issue_from_prescription(uuid, boolean, uuid, text) to authenticated;

revoke all on function public.clinical_document_issue_from_exam_request(uuid, text, boolean, uuid, text) from public, anon;
grant execute on function public.clinical_document_issue_from_exam_request(uuid, text, boolean, uuid, text) to authenticated;

revoke all on function public.clinical_document_list_for_encounter(uuid) from public, anon;
grant execute on function public.clinical_document_list_for_encounter(uuid) to authenticated;

revoke all on function public.clinical_document_list_for_patient_portal() from public, anon;
grant execute on function public.clinical_document_list_for_patient_portal() to authenticated;

revoke all on function public.clinical_document_attach_pdf(uuid, text, text) from public, anon;
grant execute on function public.clinical_document_attach_pdf(uuid, text, text) to authenticated;

revoke all on function public.clinical_document_mark_viewed(uuid) from public, anon;
grant execute on function public.clinical_document_mark_viewed(uuid) to authenticated;

revoke all on function public.clinical_document_audit_download(uuid) from public, anon;
grant execute on function public.clinical_document_audit_download(uuid) to authenticated;

revoke all on function public.clinical_document_path_ids(text) from public, anon;
grant execute on function public.clinical_document_path_ids(text) to authenticated;
