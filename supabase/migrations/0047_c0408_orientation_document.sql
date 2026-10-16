-- C040.8 — Emissão documental da orientação clínica
-- Reutiliza clinical_document_artifacts / bucket / hash / PDF / portal do C040.7 (0046).
-- Não cria tabela, bucket, hash ou portal novos.
-- Registro clínico C035 (clinical_orientations) ≠ artefato documental (orientacao).
-- Assinatura = internal_system (não ICP-Brasil).
-- Não altera actual_end / starts_at / scheduled_*.

-- ============================================================================
-- RPC: emitir documento a partir de orientação publicada
-- ============================================================================

create or replace function public.clinical_document_issue_from_orientation(
  p_orientation_id uuid,
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
  v_o public.clinical_orientations%rowtype;
  v_ver public.clinical_orientation_versions%rowtype;
  v_patient public.patients%rowtype;
  v_prof public.professionals%rowtype;
  v_profile public.profiles%rowtype;
  v_practice public.practice_units%rowtype;
  v_payload jsonb;
  v_hash text;
  v_version int;
  v_doc public.clinical_document_artifacts%rowtype;
  v_prev public.clinical_document_artifacts%rowtype;
  v_text text;
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

  if not exists (
    select 1 from public.professionals pr
    where pr.id = v_o.professional_id
      and pr.profile_id = auth.uid()
      and pr.practice_id = v_o.practice_id
  ) then
    raise exception 'PROFESSIONAL_MISMATCH';
  end if;

  if v_o.current_published_version_id is null then
    raise exception 'ORIENTATION_NOT_PUBLISHED';
  end if;

  select * into v_ver
  from public.clinical_orientation_versions
  where id = v_o.current_published_version_id
  for update;

  if not found or v_ver.status is distinct from 'published' then
    raise exception 'ORIENTATION_NOT_PUBLISHED';
  end if;

  v_text := nullif(btrim(coalesce(v_ver.final_text, '')), '');
  if v_text is null then
    raise exception 'ORIENTATION_TEXT_REQUIRED';
  end if;

  if exists (
    select 1 from public.clinical_document_artifacts d
    where d.source_type = 'orientation'
      and d.source_id = v_o.id
      and d.status = 'finalized'
  ) and p_supersedes_id is null then
    raise exception 'DOCUMENT_ALREADY_ISSUED';
  end if;

  if p_supersedes_id is not null then
    select * into v_prev from public.clinical_document_artifacts where id = p_supersedes_id for update;
    if not found
       or v_prev.patient_id is distinct from v_o.patient_id
       or v_prev.practice_id is distinct from v_o.practice_id
       or v_prev.source_type is distinct from 'orientation'
       or v_prev.status is distinct from 'finalized' then
      raise exception 'DOCUMENT_SUPERSEDE_INVALID';
    end if;
    if coalesce(nullif(btrim(p_correction_reason), ''), '') = '' then
      raise exception 'CORRECTION_REASON_REQUIRED';
    end if;
  end if;

  select * into v_patient from public.patients where id = v_o.patient_id;
  select * into v_prof from public.professionals where id = v_o.professional_id;
  select * into v_profile from public.profiles where id = v_prof.profile_id;
  select * into v_practice from public.practice_units where id = v_o.practice_id;

  v_payload := jsonb_build_object(
    'document_kind', 'orientacao',
    'document_classification', 'clinical_complementary_patient_guidance',
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
    'orientation', jsonb_build_object(
      'id', v_o.id,
      'title', v_o.title,
      'encounter_id', v_o.encounter_id,
      'version_id', v_ver.id,
      'version_number', v_ver.version,
      'delivery_mode', v_ver.delivery_mode,
      'published_at', v_ver.published_at,
      'final_text', v_text,
      'has_audio', (v_ver.audio_storage_path is not null)
    )
  );

  v_hash := public.clinical_document_canonical_hash(v_payload);

  select coalesce(max(version), 0) + 1 into v_version
  from public.clinical_document_artifacts
  where source_type = 'orientation' and source_id = v_o.id;

  if p_supersedes_id is not null then
    update public.clinical_document_artifacts
       set status = 'superseded'
     where id = p_supersedes_id;
  end if;

  -- Não altera clinical_orientations / versions (registro C035 permanece independente).

  insert into public.clinical_document_artifacts (
    organization_id, practice_id, patient_id, encounter_id, professional_id,
    source_type, source_id, document_kind, version, status, title,
    frozen_payload, content_sha256, signature_kind, signed_at, signed_by,
    available_to_patient, published_to_patient_at,
    supersedes_id, correction_reason, created_by
  ) values (
    v_o.organization_id, v_o.practice_id, v_o.patient_id, v_o.encounter_id, v_o.professional_id,
    'orientation', v_o.id, 'orientacao', v_version, 'finalized',
    coalesce(nullif(btrim(v_o.title), ''), 'Orientação clínica'),
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
      'Nova orientação em documento',
      'Sua médica disponibilizou um documento de orientação no aplicativo.',
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
      'rpc', 'clinical_document_issue_from_orientation',
      'event', case
        when p_supersedes_id is not null then 'ORIENTATION_DOCUMENT_CORRECTED'
        else 'ORIENTATION_DOCUMENT_FINALIZED'
      end,
      'source_type', 'orientation',
      'source_id', v_o.id,
      'orientation_version_id', v_ver.id,
      'content_sha256', v_hash,
      'signature_kind', 'internal_system',
      'available_to_patient', p_share_with_patient,
      'supersedes_id', p_supersedes_id
    )
  );

  return v_doc;
end;
$$;

revoke all on function public.clinical_document_issue_from_orientation(uuid, boolean, uuid, text)
  from public, anon;
grant execute on function public.clinical_document_issue_from_orientation(uuid, boolean, uuid, text)
  to authenticated;
