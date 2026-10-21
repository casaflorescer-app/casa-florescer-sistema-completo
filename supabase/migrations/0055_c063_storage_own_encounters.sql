-- C063 — Aperto de storage/exame para respeitar clinical_access = own_encounters.
-- Antes: can_read_exam_file / can_manage_clinical_exam_object liberavam qualquer physician
-- da practice; update de áudio de orientação só exigia can_write_clinical.
-- Depois: leitura/escrita alinhadas a can_read_clinical (+ can_write_clinical na escrita).
-- db push NÃO automático — aplicar só com autorização expressa.

-- ---------------------------------------------------------------------------
-- 1) Leitura de arquivo de exame: self / ops / break-glass / can_read_clinical
--    Sem professional_id → só clinical_access = practice (via can_read_clinical null).
-- ---------------------------------------------------------------------------
create or replace function public.can_read_exam_file(
  p_practice uuid,
  p_patient uuid,
  p_org uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_patient_self(p_patient)
  or public.is_house_ops(p_org)
  or public.has_active_break_glass(p_practice, p_patient)
  or public.can_read_clinical(p_practice, p_patient, null);
$$;

create or replace function public.can_read_exam_file(
  p_practice uuid,
  p_patient uuid,
  p_org uuid,
  p_professional uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_patient_self(p_patient)
  or public.is_house_ops(p_org)
  or public.has_active_break_glass(p_practice, p_patient)
  or public.can_read_clinical(p_practice, p_patient, p_professional);
$$;

revoke all on function public.can_read_exam_file(uuid, uuid, uuid) from public;
revoke all on function public.can_read_exam_file(uuid, uuid, uuid, uuid) from public;
grant execute on function public.can_read_exam_file(uuid, uuid, uuid) to authenticated;
grant execute on function public.can_read_exam_file(uuid, uuid, uuid, uuid) to authenticated;

-- exam_uploads: SELECT com professional do pedido
drop policy if exists exam_uploads_select on public.exam_uploads;
create policy exam_uploads_select on public.exam_uploads
  for select using (
    exists (
      select 1
      from public.exam_orders o
      where o.id = exam_uploads.exam_order_id
        and o.patient_id = exam_uploads.patient_id
        and o.practice_id = exam_uploads.practice_id
        and o.organization_id = exam_uploads.organization_id
        and public.can_read_exam_file(
          o.practice_id,
          o.patient_id,
          o.organization_id,
          o.professional_id
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 2) Gestão de objeto no bucket clinical-exams
-- ---------------------------------------------------------------------------
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
          array['secretary']::public.app_role[]
        )
        or (
          public.can_write_clinical(o.practice_id)
          and public.can_read_clinical(
            o.practice_id,
            o.patient_id,
            o.professional_id
          )
        )
      )
  );
$$;

revoke all on function public.can_manage_clinical_exam_object(uuid, uuid, uuid) from public;
grant execute on function public.can_manage_clinical_exam_object(uuid, uuid, uuid) to authenticated;

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
        and public.can_read_exam_file(
          o.practice_id,
          o.patient_id,
          o.organization_id,
          o.professional_id
        )
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

-- ---------------------------------------------------------------------------
-- 3) Áudio de orientação: UPDATE exige can_read_clinical (own_encounters)
-- ---------------------------------------------------------------------------
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
        and public.can_read_clinical(
          v.practice_id,
          v.patient_id,
          v.professional_id
        )
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
        and public.can_read_clinical(
          v.practice_id,
          v.patient_id,
          v.professional_id
        )
    )
  );

comment on function public.can_read_exam_file(uuid, uuid, uuid) is
  'C063: leitura sem professional — self/ops/break-glass ou clinical_access=practice.';
comment on function public.can_read_exam_file(uuid, uuid, uuid, uuid) is
  'C063: leitura com professional do pedido — aplica own_encounters via can_read_clinical.';
