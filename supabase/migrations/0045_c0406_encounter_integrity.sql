-- C040.6 — Integridade do fluxo assistencial
-- 1) Assinatura exige SOAP (soap_min) com conteúdo.
-- 2) Não criar/alterar receita ou orientação vinculadas a encounter não-open.
-- Não altera actual_end / starts_at / scheduled_*. Não é destrutiva.

-- ============================================================================
-- 1) encounter_sign: exigir soap_min com body não vazio
-- ============================================================================

create or replace function public.encounter_sign(
  p_encounter_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc public.encounters%rowtype;
  v_soap int;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_enc
  from public.encounters
  where id = p_encounter_id
  for update;

  if not found then
    raise exception 'ENCOUNTER_NOT_FOUND';
  end if;

  -- Idempotente: já assinado
  if v_enc.status = 'signed'::public.encounter_status then
    return v_enc.id;
  end if;

  if v_enc.status is distinct from 'open'::public.encounter_status then
    raise exception 'ENCOUNTER_NOT_OPEN';
  end if;

  if not public.can_write_clinical(v_enc.practice_id) then
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

  select count(*)::int into v_soap
  from public.clinical_notes n
  where n.encounter_id = v_enc.id
    and n.template_code = 'soap_min'
    and length(btrim(coalesce(n.body_ciphertext, ''))) > 0;

  if coalesce(v_soap, 0) < 1 then
    raise exception 'SOAP_REQUIRED_BEFORE_SIGN';
  end if;

  update public.encounters
     set status = 'signed'::public.encounter_status,
         signed_at = now(),
         signed_by = auth.uid()
   where id = v_enc.id
  returning * into v_enc;

  if v_enc.appointment_id is not null then
    perform set_config('casa_florescer.allow_appointment_clinical_status', '1', true);

    update public.appointments
       set status = 'completed'::public.appointment_status
     where id = v_enc.appointment_id
       and status is distinct from 'cancelled'::public.appointment_status
       and status is distinct from 'no_show'::public.appointment_status;
  end if;

  return v_enc.id;
end;
$$;

comment on function public.encounter_sign(uuid) is
  'C040.6: assina encounter open exigindo SOAP (soap_min) com conteúdo; completa appointment vinculado via GUC. Idempotente se já assinado.';

-- ============================================================================
-- 2) Receitas: base 0003 + gate ENCOUNTER_NOT_OPEN
-- ============================================================================

create or replace function public.prescriptions_before_write()
returns trigger
language plpgsql
as $$
declare
  v_patient_org uuid;
  v_prof_practice uuid;
  v_enc public.encounters%rowtype;
  v_is_physician boolean;
  v_is_ops boolean;
begin
  new.organization_id := public.resolve_org_from_practice(new.practice_id, new.organization_id);

  select organization_id into v_patient_org from public.patients where id = new.patient_id;
  select practice_id into v_prof_practice from public.professionals where id = new.professional_id;

  if v_patient_org is distinct from new.organization_id
     or v_prof_practice is distinct from new.practice_id then
    raise exception 'Receita fora do escopo organização/prática/profissional.';
  end if;

  if new.encounter_id is not null then
    select * into v_enc from public.encounters where id = new.encounter_id;
    if not found then
      raise exception 'ENCOUNTER_NOT_FOUND';
    end if;
    if v_enc.practice_id is distinct from new.practice_id
       or v_enc.patient_id is distinct from new.patient_id then
      raise exception 'Receita diverge do encounter.';
    end if;
    -- C040.6: não criar/alterar conteúdo clínico em encounter assinado/fechado
    if v_enc.status is distinct from 'open'::public.encounter_status then
      if tg_op = 'INSERT' then
        raise exception 'ENCOUNTER_NOT_OPEN';
      end if;
      if tg_op = 'UPDATE'
         and new.status = 'draft'
         and (
           coalesce(new.notes, '') is distinct from coalesce(old.notes, '')
           or new.patient_id is distinct from old.patient_id
           or new.professional_id is distinct from old.professional_id
           or new.encounter_id is distinct from old.encounter_id
         ) then
        raise exception 'ENCOUNTER_NOT_OPEN';
      end if;
    end if;
  end if;

  v_is_physician := public.can_sign_prescription(new.practice_id);
  v_is_ops := public.can_manage_prescription_ops(new.practice_id, new.organization_id);

  if tg_op = 'INSERT' then
    if not v_is_physician then
      raise exception 'Somente o médico (physician) pode criar receita.';
    end if;
    if new.status is distinct from 'draft' then
      raise exception 'Receita nasce como draft.';
    end if;
    if new.created_by is distinct from auth.uid() then
      raise exception 'created_by deve ser o médico autenticado.';
    end if;
    return new;
  end if;

  if v_is_physician then
    if old.status in ('signed', 'dispatched')
       and (
         new.patient_id is distinct from old.patient_id
         or new.professional_id is distinct from old.professional_id
         or new.notes is distinct from old.notes
         or new.encounter_id is distinct from old.encounter_id
       )
       and new.status is distinct from 'cancelled' then
      raise exception 'Receita assinada não pode ter o conteúdo alterado.';
    end if;
    if new.status = 'signed' and old.status = 'draft' then
      new.signed_at := coalesce(new.signed_at, now());
      new.signed_by := auth.uid();
    end if;
    return new;
  end if;

  if v_is_ops then
    if old.status is distinct from 'signed' then
      raise exception 'Secretaria só encaminha receitas com status signed.';
    end if;
    if new.status is distinct from 'dispatched' then
      raise exception 'Secretaria só pode transitar signed → dispatched.';
    end if;
    if new.notes is distinct from old.notes
       or new.patient_id is distinct from old.patient_id
       or new.professional_id is distinct from old.professional_id
       or new.encounter_id is distinct from old.encounter_id
       or new.signed_by is distinct from old.signed_by
       or new.signed_at is distinct from old.signed_at
       or new.practice_id is distinct from old.practice_id
       or new.organization_id is distinct from old.organization_id
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Secretaria não pode alterar conteúdo clínico ou assinatura da receita.';
    end if;
    new.dispatched_at := coalesce(new.dispatched_at, now());
    new.dispatched_by := coalesce(new.dispatched_by, auth.uid());
    return new;
  end if;

  raise exception 'Sem permissão para alterar receita.';
end;
$$;

create or replace function public.prescription_items_guard()
returns trigger
language plpgsql
as $$
declare
  v_rx public.prescriptions%rowtype;
  v_enc_status public.encounter_status;
begin
  select * into v_rx
  from public.prescriptions
  where id = coalesce(new.prescription_id, old.prescription_id);

  if not public.can_sign_prescription(v_rx.practice_id) then
    raise exception 'Somente o médico pode alterar itens da receita.';
  end if;
  if v_rx.status is distinct from 'draft' then
    raise exception 'Itens só podem ser alterados enquanto a receita está em draft.';
  end if;

  if v_rx.encounter_id is not null then
    select e.status into v_enc_status
    from public.encounters e
    where e.id = v_rx.encounter_id;
    if v_enc_status is distinct from 'open'::public.encounter_status then
      raise exception 'ENCOUNTER_NOT_OPEN';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

-- ============================================================================
-- 3) Orientações: base 0027 + gate ENCOUNTER_NOT_OPEN
-- ============================================================================

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
  v_enc public.encounters%rowtype;
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
    select * into v_enc from public.encounters where id = v_encounter;
    if not found
       or v_enc.patient_id is distinct from v_patient
       or v_enc.practice_id is distinct from v_practice
       or v_enc.organization_id is distinct from v_org then
      raise exception 'ENCOUNTER_INVALID';
    end if;
    -- C040.6
    if v_enc.status is distinct from 'open'::public.encounter_status then
      raise exception 'ENCOUNTER_NOT_OPEN';
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

comment on function public.clinical_orientation_create(jsonb) is
  'C040.6: cria orientação; se encounter_id informado, exige encounter open.';
