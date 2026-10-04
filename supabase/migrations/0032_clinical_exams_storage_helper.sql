-- C032.4 — Helper SECURITY DEFINER para escrita/leitura no bucket clinical-exams
-- (evita falha de RLS ao avaliar join em exam_orders dentro de storage.objects).

create or replace function public.can_manage_clinical_exam_object(
  p_organization_id uuid,
  p_patient_id uuid,
  p_exam_order_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.exam_orders o
    where o.id = p_exam_order_id
      and o.patient_id = p_patient_id
      and o.organization_id = p_organization_id
      and (
        public.is_patient_self(o.patient_id)
        or public.is_house_ops(o.organization_id)
        or public.has_practice_role(
          o.practice_id,
          array['physician', 'secretary']::public.app_role[]
        )
      )
  );
$$;

revoke all on function public.can_manage_clinical_exam_object(uuid, uuid, uuid) from public;
grant execute on function public.can_manage_clinical_exam_object(uuid, uuid, uuid) to authenticated;

drop policy if exists clinical_exams_insert on storage.objects;
create policy clinical_exams_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'clinical-exams'
    and exists (
      select 1
      from public.clinical_exam_path_ids(name) ids
      where public.can_manage_clinical_exam_object(
        ids.organization_id,
        ids.patient_id,
        ids.exam_order_id
      )
    )
  );

drop policy if exists clinical_exams_update on storage.objects;
create policy clinical_exams_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'clinical-exams'
    and exists (
      select 1
      from public.clinical_exam_path_ids(name) ids
      where public.can_manage_clinical_exam_object(
        ids.organization_id,
        ids.patient_id,
        ids.exam_order_id
      )
    )
  )
  with check (
    bucket_id = 'clinical-exams'
    and exists (
      select 1
      from public.clinical_exam_path_ids(name) ids
      where public.can_manage_clinical_exam_object(
        ids.organization_id,
        ids.patient_id,
        ids.exam_order_id
      )
    )
  );

drop policy if exists clinical_exams_select on storage.objects;
create policy clinical_exams_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'clinical-exams'
    and exists (
      select 1
      from public.clinical_exam_path_ids(name) ids
      join public.exam_orders o on o.id = ids.exam_order_id
      where o.patient_id = ids.patient_id
        and o.organization_id = ids.organization_id
        and public.can_read_exam_file(o.practice_id, o.patient_id, o.organization_id)
    )
  );
