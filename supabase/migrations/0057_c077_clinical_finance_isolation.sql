-- C077 — ficha clínica por prática, exame e receita fora da recepção,
-- rateio da própria fatura e repasse das duas práticas para a administradora.
-- Não edita 0001–0056. Não aplicar sem autorização. Não cria organização nem usuário.

-- ---------------------------------------------------------------------------
-- Ficha: uma linha por paciente e prática. O cadastro patients continua único.
-- ---------------------------------------------------------------------------

alter table public.patient_clinical_data
  add column if not exists practice_id uuid references public.practice_units (id);

do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'patient_clinical_data'
    and con.contype = 'u'
    and pg_get_constraintdef(con.oid) like '%(patient_id)%'
    and pg_get_constraintdef(con.oid) not like '%practice_id%';

  if constraint_name is not null then
    execute format(
      'alter table public.patient_clinical_data drop constraint %I',
      constraint_name
    );
  end if;
end $$;

alter table public.patient_clinical_data
  alter column practice_id set not null;

alter table public.patient_clinical_data
  drop constraint if exists patient_clinical_data_patient_practice_key;

alter table public.patient_clinical_data
  add constraint patient_clinical_data_patient_practice_key unique (patient_id, practice_id);

create or replace function public.patient_clinical_data_before_write()
returns trigger
language plpgsql
as $$
declare
  v_patient_org uuid;
begin
  select organization_id into v_patient_org
  from public.patients
  where id = new.patient_id;

  if v_patient_org is null then
    raise exception 'Paciente inexistente.';
  end if;
  if new.organization_id is distinct from v_patient_org then
    raise exception 'patient_clinical_data.organization_id deve coincidir com a paciente.';
  end if;
  if new.practice_id is null then
    raise exception 'patient_clinical_data.practice_id é obrigatório.';
  end if;
  if not exists (
    select 1
    from public.practice_units pu
    where pu.id = new.practice_id
      and pu.organization_id = new.organization_id
  ) then
    raise exception 'A prática da ficha não pertence à casa da paciente.';
  end if;

  new.updated_at := now();
  if new.lmp_date is null then
    if not new.edd_override then
      new.edd := null;
    end if;
  elsif tg_op = 'INSERT' then
    if new.edd is null or not new.edd_override then
      new.edd := public.naegele_edd(new.lmp_date);
    end if;
  elsif new.lmp_date is distinct from old.lmp_date and not new.edd_override then
    new.edd := public.naegele_edd(new.lmp_date);
  elsif new.edd is null then
    new.edd := public.naegele_edd(new.lmp_date);
  end if;
  return new;
end;
$$;

drop policy if exists patient_clinical_data_clinical_select on public.patient_clinical_data;
create policy patient_clinical_data_practice_select on public.patient_clinical_data
  for select using (
    public.is_patient_self(patient_id)
    or public.can_read_clinical(practice_id, patient_id, null)
  );

drop policy if exists patient_clinical_data_clinical_insert on public.patient_clinical_data;
create policy patient_clinical_data_practice_insert on public.patient_clinical_data
  for insert with check (public.can_write_clinical(practice_id));

drop policy if exists patient_clinical_data_clinical_update on public.patient_clinical_data;
create policy patient_clinical_data_practice_update on public.patient_clinical_data
  for update using (public.can_write_clinical(practice_id))
  with check (public.can_write_clinical(practice_id));

drop view if exists public.patient_safety_flags;
create view public.patient_safety_flags
with (security_invoker = false)
as
select
  c.patient_id,
  c.organization_id,
  c.practice_id,
  (nullif(btrim(coalesce(c.allergies, '')), '') is not null) as has_allergies,
  c.allergies,
  (nullif(btrim(coalesce(c.continuous_medications, '')), '') is not null) as has_continuous_medications,
  c.continuous_medications
from public.patient_clinical_data c
where public.can_read_clinical(c.practice_id, c.patient_id, null)
   or public.is_patient_self(c.patient_id);

comment on view public.patient_safety_flags is
  'Alergia da ficha daquela prática. Secretária e administradora não leem. Não substitui o prontuário.';

grant select on public.patient_safety_flags to authenticated;

-- Gestação em acompanhamento: uma por paciente em cada prática, não uma na casa.
drop index if exists public.pregnancies_one_in_care_per_patient;
create unique index if not exists pregnancies_one_in_care_per_practice
  on public.pregnancies (patient_id, practice_id)
  where status = 'in_care';

comment on index public.pregnancies_one_in_care_per_practice is
  'No máximo uma gestação em acompanhamento por paciente em cada prática.';

-- ---------------------------------------------------------------------------
-- Exame e receita: sem is_house_ops. A função is_house_ops permanece para a agenda.
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
  or public.has_active_break_glass(p_practice, p_patient)
  or public.can_read_clinical(p_practice, p_patient, p_professional);
$$;

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
        or (
          public.can_write_clinical(o.practice_id)
          and public.can_read_clinical(
            o.practice_id,
            o.patient_id,
            public.exam_order_professional_id(o.id)
          )
        )
      )
  );
$$;

create or replace function public.can_manage_prescription_ops(p_practice uuid, p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select false;
$$;

comment on function public.can_manage_prescription_ops(uuid, uuid) is
  'C077: secretária e administradora não dispensam receita. A médica da prática usa can_sign_prescription.';

drop policy if exists exam_orders_staff_select on public.exam_orders;
create policy exam_orders_practice_select on public.exam_orders
  for select using (
    public.can_read_exam_file(
      practice_id,
      patient_id,
      organization_id,
      public.exam_order_professional_id(id)
    )
  );

drop policy if exists exam_orders_ops_update on public.exam_orders;
create policy exam_orders_physician_update on public.exam_orders
  for update using (public.can_write_clinical(practice_id))
  with check (public.can_write_clinical(practice_id));

drop policy if exists exam_uploads_ops_insert on public.exam_uploads;
create policy exam_uploads_physician_insert on public.exam_uploads
  for insert with check (public.can_write_clinical(practice_id));

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
  v_is_physician boolean;
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

  if not exists (
    select 1
    from public.practice_units pu
    where pu.id = v_practice
      and pu.organization_id = v_org
  ) then
    raise exception 'PRACTICE_INVALID';
  end if;

  v_is_patient := public.is_patient_self(v_patient);
  v_is_physician := public.has_practice_role(v_practice, array['physician']::public.app_role[]);

  if v_source = 'paciente' and not v_is_patient then
    raise exception 'FORBIDDEN';
  end if;

  if v_source = 'secretaria' and not v_is_physician then
    raise exception 'FORBIDDEN';
  end if;

  if not v_is_patient and not v_is_physician then
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
    or public.has_practice_role(v_order.practice_id, array['physician']::public.app_role[])
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

-- ---------------------------------------------------------------------------
-- Rateio da própria fatura. Repasse das duas práticas para a administradora.
-- ---------------------------------------------------------------------------

drop policy if exists payment_splits_via_payment on public.payment_splits;
create policy payment_splits_select on public.payment_splits
  for select using (
    exists (
      select 1
      from public.payments pay
      join public.invoices i on i.id = pay.invoice_id
      where pay.id = payment_id
        and (
          public.is_house_staff(i.organization_id, array['owner', 'admin']::public.app_role[])
          or exists (
            select 1
            from public.user_practice_roles r
            where r.user_id = auth.uid()
              and r.practice_id = i.practice_id
              and r.can_cashier
          )
        )
    )
  );

create or replace function public.can_read_pregnancy_procedure_payout(
  p_practice uuid,
  p_principal uuid,
  p_backup uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_practice_role(p_practice, array['owner', 'admin']::public.app_role[])
    or exists (
      select 1
      from public.practice_units pu
      where pu.id = p_practice
        and public.is_house_staff(pu.organization_id, array['admin']::public.app_role[])
    )
    or public.is_professional_self(p_principal)
    or public.is_professional_self(p_backup);
$$;

comment on function public.can_read_pregnancy_procedure_payout(uuid, uuid, uuid) is
  'C077: admin da casa lê o repasse das práticas. A outra médica só lê se for principal ou retaguarda nomeada. Secretária não lê.';
