-- C040.9 — Fechamento módulo receitas/exames (RPCs)
-- Não destrutiva. Sem novas tabelas de documentos/buckets.
-- Corrige apply de modelo; persiste indicação clínica no pedido; enriquece snapshot de exames.
-- SNCR / assinatura qualificada NÃO implementados nesta migration.
-- Não altera actual_end / starts_at / scheduled_*.

-- ============================================================================
-- 1) prescription_template_apply — copiar todos os campos do modelo
-- ============================================================================

create or replace function public.prescription_template_apply(
  p_template_id uuid,
  p_encounter_id uuid
)
returns public.prescriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc public.encounters%rowtype;
  v_tpl public.prescription_templates%rowtype;
  v_rx public.prescriptions%rowtype;
  v_item public.prescription_template_items%rowtype;
  v_dosage text;
  v_instructions text;
begin
  v_enc := public.c0404_assert_encounter_writer(p_encounter_id);
  if v_enc.status is distinct from 'open'::public.encounter_status then
    raise exception 'ENCOUNTER_NOT_OPEN';
  end if;

  select * into v_tpl from public.prescription_templates
  where id = p_template_id and practice_id = v_enc.practice_id and is_active;
  if not found then raise exception 'TEMPLATE_NOT_FOUND'; end if;

  insert into public.prescriptions (
    organization_id, practice_id, patient_id, professional_id, encounter_id, status, notes, created_by
  ) values (
    v_enc.organization_id, v_enc.practice_id, v_enc.patient_id, v_enc.professional_id, v_enc.id,
    'draft'::public.prescription_status,
    'Modelo: ' || v_tpl.name,
    auth.uid()
  ) returning * into v_rx;

  for v_item in
    select * from public.prescription_template_items
    where template_id = v_tpl.id
    order by sort_order
  loop
    v_dosage := nullif(btrim(coalesce(v_item.dosage, '')), '');
    if v_dosage is null and nullif(btrim(coalesce(v_item.concentration, '')), '') is not null then
      v_dosage := btrim(v_item.concentration);
    end if;
    v_instructions := nullif(btrim(coalesce(v_item.observations, '')), '');
    if nullif(btrim(coalesce(v_item.concentration, '')), '') is not null
       and v_item.dosage is not null
       and btrim(v_item.concentration) is distinct from btrim(coalesce(v_item.dosage, '')) then
      v_instructions := trim(both from concat_ws(
        E'\n',
        'Concentração (modelo): ' || btrim(v_item.concentration),
        v_instructions
      ));
    end if;

    insert into public.prescription_items (
      prescription_id, medication_name, presentation, quantity, dosage,
      frequency, duration, route, instructions, sort_order
    ) values (
      v_rx.id,
      v_item.medication_name,
      v_item.presentation,
      v_item.quantity,
      v_dosage,
      v_item.frequency,
      v_item.duration,
      v_item.route,
      v_instructions,
      coalesce(v_item.sort_order, 0)
    );
  end loop;

  perform public.write_audit(
    'insert'::public.audit_action, 'prescriptions', v_rx.id,
    v_enc.practice_id, v_enc.patient_id,
    jsonb_build_object(
      'rpc','prescription_template_apply',
      'event','prescription_created',
      'from_template_id', v_tpl.id,
      'encounter_id', v_enc.id
    )
  );
  return v_rx;
end;
$$;

-- ============================================================================
-- 2) clinical_exam_request_create — persistir clinical_indication
-- ============================================================================

-- Remove assinatura antiga (6 args) para evitar overload; a nova tem default no 7º.
drop function if exists public.clinical_exam_request_create(uuid, uuid[], uuid[], text[], text, boolean);

create or replace function public.clinical_exam_request_create(
  p_encounter_id uuid,
  p_catalog_ids uuid[] default '{}',
  p_group_ids uuid[] default '{}',
  p_custom_names text[] default '{}',
  p_notes text default null,
  p_confirm boolean default false,
  p_clinical_indication text default null
)
returns public.clinical_exam_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc public.encounters%rowtype;
  v_row public.clinical_exam_requests%rowtype;
  v_id uuid;
  v_name text;
  v_ord integer := 0;
  v_cid uuid;
  v_indication text;
begin
  v_enc := public.c0404_assert_encounter_writer(p_encounter_id);
  if v_enc.status is distinct from 'open'::public.encounter_status then
    raise exception 'ENCOUNTER_NOT_OPEN';
  end if;

  v_indication := nullif(btrim(coalesce(p_clinical_indication, '')), '');

  insert into public.clinical_exam_requests (
    organization_id, practice_id, patient_id, encounter_id, professional_id,
    status, notes, clinical_indication, confirmed_at, created_by
  ) values (
    v_enc.organization_id, v_enc.practice_id, v_enc.patient_id, v_enc.id, v_enc.professional_id,
    case when p_confirm then 'confirmed' else 'draft' end,
    nullif(trim(coalesce(p_notes,'')), ''),
    v_indication,
    case when p_confirm then now() else null end,
    auth.uid()
  ) returning * into v_row;

  if p_group_ids is not null then
    foreach v_id in array p_group_ids loop
      if v_id is null then continue; end if;
      for v_cid in
        select i.catalog_id
        from public.clinical_exam_group_items i
        join public.clinical_exam_groups g on g.id = i.group_id
        where i.group_id = v_id and g.practice_id = v_enc.practice_id and g.is_active
        order by i.sort_order
      loop
        v_ord := v_ord + 10;
        insert into public.clinical_exam_request_items (request_id, catalog_id, group_id, sort_order)
        values (v_row.id, v_cid, v_id, v_ord);
      end loop;
    end loop;
  end if;

  if p_catalog_ids is not null then
    foreach v_id in array p_catalog_ids loop
      if v_id is null then continue; end if;
      if not exists (
        select 1 from public.clinical_exam_catalog c
        where c.id = v_id and c.practice_id = v_enc.practice_id and c.is_active
      ) then raise exception 'CATALOG_ITEM_INVALID'; end if;
      v_ord := v_ord + 10;
      insert into public.clinical_exam_request_items (request_id, catalog_id, sort_order)
      values (v_row.id, v_id, v_ord);
    end loop;
  end if;

  if p_custom_names is not null then
    foreach v_name in array p_custom_names loop
      if v_name is null or length(trim(v_name)) = 0 then continue; end if;
      v_ord := v_ord + 10;
      insert into public.clinical_exam_request_items (request_id, custom_name, sort_order)
      values (v_row.id, trim(v_name), v_ord);
    end loop;
  end if;

  if v_ord = 0 then
    raise exception 'EXAM_ITEMS_REQUIRED';
  end if;

  perform public.write_audit(
    'insert'::public.audit_action, 'clinical_exam_requests', v_row.id,
    v_enc.practice_id, v_enc.patient_id,
    jsonb_build_object(
      'rpc','clinical_exam_request_create',
      'event', case when p_confirm then 'exam_order_created' else 'exam_order_drafted' end,
      'encounter_id', v_enc.id,
      'items', v_ord / 10,
      'has_clinical_indication', v_indication is not null
    )
  );
  return v_row;
end;
$$;

revoke all on function public.clinical_exam_request_create(uuid, uuid[], uuid[], text[], text, boolean, text)
  from public, anon;
grant execute on function public.clinical_exam_request_create(uuid, uuid[], uuid[], text[], text, boolean, text)
  to authenticated;

-- ============================================================================
-- 3) Snapshot de exames — incluir nome do grupo no frozen_payload
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
      'group_name', g.name,
      'name', coalesce(c.name, i.custom_name, 'Exame'),
      'custom_name', i.custom_name,
      'sort_order', i.sort_order
    ) order by i.sort_order
  ), '[]'::jsonb)
  into v_items
  from public.clinical_exam_request_items i
  left join public.clinical_exam_catalog c on c.id = i.catalog_id
  left join public.clinical_exam_groups g on g.id = i.group_id
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

comment on function public.clinical_exam_request_create(uuid, uuid[], uuid[], text[], text, boolean, text) is
  'C040.9: pedido de exames; p_clinical_indication opcional persistido no rascunho.';
comment on function public.prescription_template_apply(uuid, uuid) is
  'C040.9: aplica modelo para NOVO rascunho copiando presentation/route/quantity/instructions.';
