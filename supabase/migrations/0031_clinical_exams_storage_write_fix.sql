-- C032.4 — Corrigir escrita no bucket clinical-exams (insert + upsert).

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
          or public.has_practice_role(
            o.practice_id,
            array['physician', 'secretary']::public.app_role[]
          )
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
      join public.exam_orders o on o.id = ids.exam_order_id
      where o.patient_id = ids.patient_id
        and o.organization_id = ids.organization_id
        and (
          public.is_patient_self(o.patient_id)
          or public.is_house_ops(o.organization_id)
          or public.has_practice_role(
            o.practice_id,
            array['physician', 'secretary']::public.app_role[]
          )
        )
    )
  )
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
          or public.has_practice_role(
            o.practice_id,
            array['physician', 'secretary']::public.app_role[]
          )
        )
    )
  );
