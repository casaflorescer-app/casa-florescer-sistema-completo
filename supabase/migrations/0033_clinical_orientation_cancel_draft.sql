-- C032.4 / Commit 035 prep
-- Cancelamento pré-publicação de orientação (draft → archived).
--
-- Justificativa: clinical_orientations / clinical_orientation_versions só
-- concedem SELECT a authenticated; mutações passam por RPC SECURITY DEFINER.
-- Sem esta RPC não há caminho seguro de cancelar rascunho com auditoria.
-- Reutiliza status `archived` (já no CHECK); sem novo estado.
-- Não redefine clinical_orientation_publish (permanece a versão da 0030).
-- Não altera agenda, prediction, blocks, obstetrícia, SOAP ou grants globais.

create or replace function public.clinical_orientation_cancel_draft(p_version_id uuid)
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
     set status = 'archived'
   where id = p_version_id
  returning * into v_row;

  update public.clinical_orientations
     set updated_at = now()
   where id = v_row.orientation_id;

  -- Não notifica paciente. Não altera current_published_version_id.
  perform public.write_audit(
    'update'::public.audit_action,
    'clinical_orientation_versions',
    v_row.id,
    v_row.practice_id,
    v_row.patient_id,
    jsonb_build_object(
      'rpc', 'clinical_orientation_cancel_draft',
      'event', 'ORIENTATION_CANCELLED',
      'orientation_id', v_row.orientation_id,
      'version', v_row.version,
      'cancelled_by', auth.uid(),
      'cancelled_at', now()
    )
  );

  return v_row;
end;
$$;

revoke all on function public.clinical_orientation_cancel_draft(uuid) from public, anon;
grant execute on function public.clinical_orientation_cancel_draft(uuid) to authenticated;

-- Auditoria do vínculo exame ↔ orientação (sem mudar schema).
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
    perform public.write_audit(
      'update'::public.audit_action,
      'clinical_orientation_exams',
      p_orientation_id,
      v_o.practice_id,
      v_o.patient_id,
      jsonb_build_object(
        'rpc', 'clinical_orientation_link_exams',
        'event', 'EXAM_LINKED',
        'orientation_id', p_orientation_id,
        'exam_order_ids', '[]'::jsonb
      )
    );
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

  perform public.write_audit(
    'update'::public.audit_action,
    'clinical_orientation_exams',
    p_orientation_id,
    v_o.practice_id,
    v_o.patient_id,
    jsonb_build_object(
      'rpc', 'clinical_orientation_link_exams',
      'event', 'EXAM_LINKED',
      'orientation_id', p_orientation_id,
      'exam_count', coalesce(array_length(p_exam_order_ids, 1), 0)
    )
  );
end;
$$;
