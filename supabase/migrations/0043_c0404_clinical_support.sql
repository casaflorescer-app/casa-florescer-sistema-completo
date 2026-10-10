-- C040.4 — Auxílio IA + catálogo/grupos de exames + modelos de receita + pedidos
-- Não altera 0001–0042. Não destrói tabelas clínicas existentes.
-- exam_orders permanece para anexos/resultados (C035). Pedidos ficam em clinical_exam_requests.

-- ============================================================================
-- 1) Catálogo de exames
-- ============================================================================

create table if not exists public.clinical_exam_catalog (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  name text not null,
  short_name text,
  category text,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (practice_id, name)
);

create index if not exists clinical_exam_catalog_practice_idx
  on public.clinical_exam_catalog (practice_id, is_active, sort_order, name);

create table if not exists public.clinical_exam_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  name text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (practice_id, name)
);

create index if not exists clinical_exam_groups_practice_idx
  on public.clinical_exam_groups (practice_id, is_active, sort_order, name);

create table if not exists public.clinical_exam_group_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.clinical_exam_groups (id) on delete cascade,
  catalog_id uuid not null references public.clinical_exam_catalog (id),
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  unique (group_id, catalog_id)
);

create index if not exists clinical_exam_group_items_group_idx
  on public.clinical_exam_group_items (group_id, sort_order);

-- Pedido de exames (≠ resultado/anexo em exam_orders)
create table if not exists public.clinical_exam_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  patient_id uuid not null references public.patients (id),
  encounter_id uuid not null references public.encounters (id),
  professional_id uuid not null references public.professionals (id),
  status text not null default 'draft'
    check (status in ('draft', 'confirmed', 'cancelled')),
  notes text,
  confirmed_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clinical_exam_requests_encounter_idx
  on public.clinical_exam_requests (encounter_id, created_at desc);

create table if not exists public.clinical_exam_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.clinical_exam_requests (id) on delete cascade,
  catalog_id uuid references public.clinical_exam_catalog (id),
  group_id uuid references public.clinical_exam_groups (id),
  custom_name text,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  check (catalog_id is not null or (custom_name is not null and length(trim(custom_name)) > 0))
);

create index if not exists clinical_exam_request_items_request_idx
  on public.clinical_exam_request_items (request_id, sort_order);

-- ============================================================================
-- 2) Modelos de receita
-- ============================================================================

create table if not exists public.prescription_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  name text not null,
  description text,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (practice_id, name)
);

create index if not exists prescription_templates_practice_idx
  on public.prescription_templates (practice_id, is_active, name);

create table if not exists public.prescription_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.prescription_templates (id) on delete cascade,
  medication_name text not null,
  presentation text,
  concentration text,
  dosage text,
  route text,
  frequency text,
  duration text,
  quantity text,
  observations text,
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

create index if not exists prescription_template_items_template_idx
  on public.prescription_template_items (template_id, sort_order);

-- ============================================================================
-- 3) Auxílio IA (sugestões — nunca prontuário definitivo)
-- ============================================================================

create table if not exists public.ai_assistance_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  patient_id uuid not null references public.patients (id),
  encounter_id uuid not null references public.encounters (id),
  professional_id uuid not null references public.professionals (id),
  suggestion_type text not null
    check (suggestion_type in (
      'summary', 'anamnesis_organize', 'soap', 'missing_info',
      'followup_questions', 'exam_suggestion', 'treatment_hint'
    )),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'available', 'failed', 'unavailable')),
  provider text,
  model text,
  error_message text,
  context_fingerprint text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_assistance_requests_encounter_idx
  on public.ai_assistance_requests (encounter_id, created_at desc);

create table if not exists public.ai_assistance_results (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.ai_assistance_requests (id) on delete cascade,
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  patient_id uuid not null references public.patients (id),
  encounter_id uuid not null references public.encounters (id),
  version integer not null default 1,
  is_simulation boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  review_status text not null default 'pending'
    check (review_status in ('pending', 'accepted', 'rejected', 'edited_accepted')),
  reviewed_payload jsonb,
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (request_id, version)
);

create index if not exists ai_assistance_results_encounter_idx
  on public.ai_assistance_results (encounter_id, created_at desc);

comment on table public.ai_assistance_results is
  'C040.4: sugestões de IA. Nunca substituem prontuário sem ação explícita da médica.';

-- ============================================================================
-- 4) RLS
-- ============================================================================

revoke all on table public.clinical_exam_catalog from public, anon, authenticated;
revoke all on table public.clinical_exam_groups from public, anon, authenticated;
revoke all on table public.clinical_exam_group_items from public, anon, authenticated;
revoke all on table public.clinical_exam_requests from public, anon, authenticated;
revoke all on table public.clinical_exam_request_items from public, anon, authenticated;
revoke all on table public.prescription_templates from public, anon, authenticated;
revoke all on table public.prescription_template_items from public, anon, authenticated;
revoke all on table public.ai_assistance_requests from public, anon, authenticated;
revoke all on table public.ai_assistance_results from public, anon, authenticated;

grant select on table public.clinical_exam_catalog to authenticated;
grant select on table public.clinical_exam_groups to authenticated;
grant select on table public.clinical_exam_group_items to authenticated;
grant select on table public.clinical_exam_requests to authenticated;
grant select on table public.clinical_exam_request_items to authenticated;
grant select on table public.prescription_templates to authenticated;
grant select on table public.prescription_template_items to authenticated;
grant select on table public.ai_assistance_requests to authenticated;
grant select on table public.ai_assistance_results to authenticated;

alter table public.clinical_exam_catalog enable row level security;
alter table public.clinical_exam_groups enable row level security;
alter table public.clinical_exam_group_items enable row level security;
alter table public.clinical_exam_requests enable row level security;
alter table public.clinical_exam_request_items enable row level security;
alter table public.prescription_templates enable row level security;
alter table public.prescription_template_items enable row level security;
alter table public.ai_assistance_requests enable row level security;
alter table public.ai_assistance_results enable row level security;

create policy clinical_exam_catalog_physician_select on public.clinical_exam_catalog
  for select to authenticated
  using (public.can_write_clinical(practice_id) or public.has_practice_role(practice_id, array['physician']::public.app_role[]));

create policy clinical_exam_groups_physician_select on public.clinical_exam_groups
  for select to authenticated
  using (public.can_write_clinical(practice_id) or public.has_practice_role(practice_id, array['physician']::public.app_role[]));

create policy clinical_exam_group_items_physician_select on public.clinical_exam_group_items
  for select to authenticated
  using (
    exists (
      select 1 from public.clinical_exam_groups g
      where g.id = group_id
        and (public.can_write_clinical(g.practice_id) or public.has_practice_role(g.practice_id, array['physician']::public.app_role[]))
    )
  );

create policy clinical_exam_requests_physician_select on public.clinical_exam_requests
  for select to authenticated
  using (public.can_read_clinical(practice_id, patient_id, professional_id));

create policy clinical_exam_request_items_physician_select on public.clinical_exam_request_items
  for select to authenticated
  using (
    exists (
      select 1 from public.clinical_exam_requests r
      where r.id = request_id
        and public.can_read_clinical(r.practice_id, r.patient_id, r.professional_id)
    )
  );

create policy prescription_templates_physician_select on public.prescription_templates
  for select to authenticated
  using (public.can_write_clinical(practice_id) or public.has_practice_role(practice_id, array['physician']::public.app_role[]));

create policy prescription_template_items_physician_select on public.prescription_template_items
  for select to authenticated
  using (
    exists (
      select 1 from public.prescription_templates t
      where t.id = template_id
        and (public.can_write_clinical(t.practice_id) or public.has_practice_role(t.practice_id, array['physician']::public.app_role[]))
    )
  );

create policy ai_assistance_requests_physician_select on public.ai_assistance_requests
  for select to authenticated
  using (public.can_read_clinical(practice_id, patient_id, professional_id));

create policy ai_assistance_results_physician_select on public.ai_assistance_results
  for select to authenticated
  using (
    public.can_read_clinical(
      practice_id,
      patient_id,
      (select e.professional_id from public.encounters e where e.id = encounter_id)
    )
  );

-- ============================================================================
-- 5) Helpers
-- ============================================================================

create or replace function public.c0404_assert_encounter_writer(p_encounter_id uuid)
returns public.encounters
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

  select * into v_enc from public.encounters where id = p_encounter_id for share;
  if not found then
    raise exception 'ENCOUNTER_NOT_FOUND';
  end if;
  if not public.can_write_clinical(v_enc.practice_id) then
    raise exception 'FORBIDDEN';
  end if;
  if not public.can_read_clinical(v_enc.practice_id, v_enc.patient_id, v_enc.professional_id) then
    raise exception 'FORBIDDEN';
  end if;
  if not exists (
    select 1 from public.professionals pr
    where pr.id = v_enc.professional_id
      and pr.profile_id = auth.uid()
      and pr.practice_id = v_enc.practice_id
  ) then
    raise exception 'ENCOUNTER_OWNER_REQUIRED';
  end if;
  return v_enc;
end;
$$;

revoke all on function public.c0404_assert_encounter_writer(uuid) from public, anon;
grant execute on function public.c0404_assert_encounter_writer(uuid) to authenticated;

-- ============================================================================
-- 6) RPCs — catálogo / grupos
-- ============================================================================

create or replace function public.clinical_exam_catalog_upsert(
  p_practice_id uuid,
  p_name text,
  p_id uuid default null,
  p_short_name text default null,
  p_category text default null,
  p_description text default null,
  p_is_active boolean default true,
  p_sort_order integer default 100
)
returns public.clinical_exam_catalog
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_row public.clinical_exam_catalog%rowtype;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.can_write_clinical(p_practice_id) then raise exception 'FORBIDDEN'; end if;
  if p_name is null or length(trim(p_name)) < 2 then raise exception 'NAME_REQUIRED'; end if;

  select organization_id into v_org from public.practice_units where id = p_practice_id;
  if v_org is null then raise exception 'PRACTICE_NOT_FOUND'; end if;

  if p_id is null then
    insert into public.clinical_exam_catalog (
      organization_id, practice_id, name, short_name, category, description,
      is_active, sort_order, created_by
    ) values (
      v_org, p_practice_id, trim(p_name), nullif(trim(coalesce(p_short_name,'')), ''),
      nullif(trim(coalesce(p_category,'')), ''), nullif(trim(coalesce(p_description,'')), ''),
      coalesce(p_is_active, true), coalesce(p_sort_order, 100), auth.uid()
    )
    returning * into v_row;
    perform public.write_audit('insert'::public.audit_action, 'clinical_exam_catalog', v_row.id, p_practice_id, null,
      jsonb_build_object('rpc','clinical_exam_catalog_upsert','event','exam_catalog_upserted'));
  else
    update public.clinical_exam_catalog
       set name = trim(p_name),
           short_name = nullif(trim(coalesce(p_short_name,'')), ''),
           category = nullif(trim(coalesce(p_category,'')), ''),
           description = nullif(trim(coalesce(p_description,'')), ''),
           is_active = coalesce(p_is_active, is_active),
           sort_order = coalesce(p_sort_order, sort_order),
           updated_at = now()
     where id = p_id and practice_id = p_practice_id
    returning * into v_row;
    if not found then raise exception 'CATALOG_NOT_FOUND'; end if;
    perform public.write_audit('update'::public.audit_action, 'clinical_exam_catalog', v_row.id, p_practice_id, null,
      jsonb_build_object('rpc','clinical_exam_catalog_upsert','event','exam_catalog_upserted'));
  end if;
  return v_row;
end;
$$;

create or replace function public.clinical_exam_group_upsert(
  p_practice_id uuid,
  p_name text,
  p_catalog_ids uuid[],
  p_id uuid default null,
  p_description text default null,
  p_is_active boolean default true,
  p_sort_order integer default 100
)
returns public.clinical_exam_groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_row public.clinical_exam_groups%rowtype;
  v_id uuid;
  v_ord integer := 0;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.can_write_clinical(p_practice_id) then raise exception 'FORBIDDEN'; end if;
  if p_name is null or length(trim(p_name)) < 2 then raise exception 'NAME_REQUIRED'; end if;
  select organization_id into v_org from public.practice_units where id = p_practice_id;
  if v_org is null then raise exception 'PRACTICE_NOT_FOUND'; end if;

  if p_id is null then
    insert into public.clinical_exam_groups (
      organization_id, practice_id, name, description, is_active, sort_order, created_by
    ) values (
      v_org, p_practice_id, trim(p_name), nullif(trim(coalesce(p_description,'')), ''),
      coalesce(p_is_active, true), coalesce(p_sort_order, 100), auth.uid()
    ) returning * into v_row;
  else
    update public.clinical_exam_groups
       set name = trim(p_name),
           description = nullif(trim(coalesce(p_description,'')), ''),
           is_active = coalesce(p_is_active, is_active),
           sort_order = coalesce(p_sort_order, sort_order),
           updated_at = now()
     where id = p_id and practice_id = p_practice_id
    returning * into v_row;
    if not found then raise exception 'GROUP_NOT_FOUND'; end if;
    delete from public.clinical_exam_group_items where group_id = v_row.id;
  end if;

  if p_catalog_ids is not null then
    foreach v_id in array p_catalog_ids loop
      if v_id is null then continue; end if;
      if not exists (
        select 1 from public.clinical_exam_catalog c
        where c.id = v_id and c.practice_id = p_practice_id and c.is_active
      ) then
        raise exception 'CATALOG_ITEM_INVALID';
      end if;
      v_ord := v_ord + 10;
      insert into public.clinical_exam_group_items (group_id, catalog_id, sort_order)
      values (v_row.id, v_id, v_ord);
    end loop;
  end if;

  perform public.write_audit(
    case when p_id is null then 'insert'::public.audit_action else 'update'::public.audit_action end,
    'clinical_exam_groups', v_row.id, p_practice_id, null,
    jsonb_build_object('rpc','clinical_exam_group_upsert','event','exam_group_upserted','items', coalesce(cardinality(p_catalog_ids),0))
  );
  return v_row;
end;
$$;

-- ============================================================================
-- 7) RPCs — pedido de exames
-- ============================================================================

create or replace function public.clinical_exam_request_create(
  p_encounter_id uuid,
  p_catalog_ids uuid[] default '{}',
  p_group_ids uuid[] default '{}',
  p_custom_names text[] default '{}',
  p_notes text default null,
  p_confirm boolean default false
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
begin
  v_enc := public.c0404_assert_encounter_writer(p_encounter_id);
  if v_enc.status is distinct from 'open'::public.encounter_status then
    raise exception 'ENCOUNTER_NOT_OPEN';
  end if;

  insert into public.clinical_exam_requests (
    organization_id, practice_id, patient_id, encounter_id, professional_id,
    status, notes, confirmed_at, created_by
  ) values (
    v_enc.organization_id, v_enc.practice_id, v_enc.patient_id, v_enc.id, v_enc.professional_id,
    case when p_confirm then 'confirmed' else 'draft' end,
    nullif(trim(coalesce(p_notes,'')), ''),
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
      'items', v_ord / 10
    )
  );
  return v_row;
end;
$$;

create or replace function public.clinical_exam_request_confirm(p_request_id uuid)
returns public.clinical_exam_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.clinical_exam_requests%rowtype;
  v_enc public.encounters%rowtype;
begin
  select * into v_row from public.clinical_exam_requests where id = p_request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  v_enc := public.c0404_assert_encounter_writer(v_row.encounter_id);
  if v_enc.status is distinct from 'open'::public.encounter_status then
    raise exception 'ENCOUNTER_NOT_OPEN';
  end if;
  if v_row.status = 'cancelled' then raise exception 'REQUEST_CANCELLED'; end if;
  update public.clinical_exam_requests
     set status = 'confirmed', confirmed_at = coalesce(confirmed_at, now()), updated_at = now()
   where id = p_request_id
  returning * into v_row;
  perform public.write_audit(
    'update'::public.audit_action, 'clinical_exam_requests', v_row.id,
    v_enc.practice_id, v_enc.patient_id,
    jsonb_build_object('rpc','clinical_exam_request_confirm','event','exam_order_updated','encounter_id', v_enc.id)
  );
  return v_row;
end;
$$;

-- ============================================================================
-- 8) RPCs — modelos de receita
-- ============================================================================

create or replace function public.prescription_template_upsert(
  p_practice_id uuid,
  p_name text,
  p_items jsonb,
  p_id uuid default null,
  p_description text default null,
  p_is_active boolean default true
)
returns public.prescription_templates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_row public.prescription_templates%rowtype;
  v_item jsonb;
  v_ord integer := 0;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.can_write_clinical(p_practice_id) then raise exception 'FORBIDDEN'; end if;
  if p_name is null or length(trim(p_name)) < 2 then raise exception 'NAME_REQUIRED'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'ITEMS_REQUIRED';
  end if;
  select organization_id into v_org from public.practice_units where id = p_practice_id;
  if v_org is null then raise exception 'PRACTICE_NOT_FOUND'; end if;

  if p_id is null then
    insert into public.prescription_templates (
      organization_id, practice_id, name, description, is_active, created_by
    ) values (
      v_org, p_practice_id, trim(p_name), nullif(trim(coalesce(p_description,'')), ''),
      coalesce(p_is_active, true), auth.uid()
    ) returning * into v_row;
  else
    update public.prescription_templates
       set name = trim(p_name),
           description = nullif(trim(coalesce(p_description,'')), ''),
           is_active = coalesce(p_is_active, is_active),
           updated_at = now()
     where id = p_id and practice_id = p_practice_id
    returning * into v_row;
    if not found then raise exception 'TEMPLATE_NOT_FOUND'; end if;
    delete from public.prescription_template_items where template_id = v_row.id;
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if coalesce(trim(v_item->>'medication_name'), '') = '' then
      raise exception 'MEDICATION_REQUIRED';
    end if;
    v_ord := v_ord + 10;
    insert into public.prescription_template_items (
      template_id, medication_name, presentation, concentration, dosage, route,
      frequency, duration, quantity, observations, sort_order
    ) values (
      v_row.id,
      trim(v_item->>'medication_name'),
      nullif(trim(coalesce(v_item->>'presentation','')), ''),
      nullif(trim(coalesce(v_item->>'concentration','')), ''),
      nullif(trim(coalesce(v_item->>'dosage','')), ''),
      nullif(trim(coalesce(v_item->>'route','')), ''),
      nullif(trim(coalesce(v_item->>'frequency','')), ''),
      nullif(trim(coalesce(v_item->>'duration','')), ''),
      nullif(trim(coalesce(v_item->>'quantity','')), ''),
      nullif(trim(coalesce(v_item->>'observations','')), ''),
      v_ord
    );
  end loop;

  perform public.write_audit(
    case when p_id is null then 'insert'::public.audit_action else 'update'::public.audit_action end,
    'prescription_templates', v_row.id, p_practice_id, null,
    jsonb_build_object(
      'rpc','prescription_template_upsert',
      'event', case when p_id is null then 'prescription_template_created' else 'prescription_template_updated' end,
      'items', v_ord / 10
    )
  );
  return v_row;
end;
$$;

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
begin
  v_enc := public.c0404_assert_encounter_writer(p_encounter_id);
  if v_enc.status is distinct from 'open'::public.encounter_status then
    raise exception 'ENCOUNTER_NOT_OPEN';
  end if;

  select * into v_tpl from public.prescription_templates
  where id = p_template_id and practice_id = v_enc.practice_id and is_active;
  if not found then raise exception 'TEMPLATE_NOT_FOUND'; end if;

  insert into public.prescriptions (
    organization_id, practice_id, patient_id, professional_id, encounter_id, status, created_by
  ) values (
    v_enc.organization_id, v_enc.practice_id, v_enc.patient_id, v_enc.professional_id, v_enc.id,
    'draft'::public.prescription_status, auth.uid()
  ) returning * into v_rx;

  for v_item in
    select * from public.prescription_template_items
    where template_id = v_tpl.id
    order by sort_order
  loop
    insert into public.prescription_items (
      prescription_id, medication_name, dosage, frequency, duration
    ) values (
      v_rx.id,
      v_item.medication_name,
      coalesce(v_item.dosage, v_item.concentration),
      v_item.frequency,
      v_item.duration
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
-- 9) RPCs — IA
-- ============================================================================

create or replace function public.ai_assistance_request_create(
  p_encounter_id uuid,
  p_suggestion_type text,
  p_context_fingerprint text default null
)
returns public.ai_assistance_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc public.encounters%rowtype;
  v_row public.ai_assistance_requests%rowtype;
begin
  v_enc := public.c0404_assert_encounter_writer(p_encounter_id);
  if v_enc.status is distinct from 'open'::public.encounter_status then
    raise exception 'ENCOUNTER_NOT_OPEN';
  end if;
  if p_suggestion_type not in (
    'summary','anamnesis_organize','soap','missing_info',
    'followup_questions','exam_suggestion','treatment_hint'
  ) then
    raise exception 'INVALID_SUGGESTION_TYPE';
  end if;

  insert into public.ai_assistance_requests (
    organization_id, practice_id, patient_id, encounter_id, professional_id,
    suggestion_type, status, context_fingerprint, created_by
  ) values (
    v_enc.organization_id, v_enc.practice_id, v_enc.patient_id, v_enc.id, v_enc.professional_id,
    p_suggestion_type, 'pending', p_context_fingerprint, auth.uid()
  ) returning * into v_row;

  perform public.write_audit(
    'insert'::public.audit_action, 'ai_assistance_requests', v_row.id,
    v_enc.practice_id, v_enc.patient_id,
    jsonb_build_object(
      'rpc','ai_assistance_request_create',
      'event','ai_suggestion_requested',
      'encounter_id', v_enc.id,
      'suggestion_type', p_suggestion_type
    )
  );
  return v_row;
end;
$$;

create or replace function public.ai_assistance_save_result(
  p_request_id uuid,
  p_status text,
  p_provider text default null,
  p_model text default null,
  p_payload jsonb default '{}'::jsonb,
  p_is_simulation boolean default false,
  p_error_message text default null
)
returns public.ai_assistance_results
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.ai_assistance_requests%rowtype;
  v_enc public.encounters%rowtype;
  v_row public.ai_assistance_results%rowtype;
  v_ver integer;
begin
  select * into v_req from public.ai_assistance_requests where id = p_request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  v_enc := public.c0404_assert_encounter_writer(v_req.encounter_id);

  if p_status not in ('processing','available','failed','unavailable') then
    raise exception 'INVALID_STATUS';
  end if;

  update public.ai_assistance_requests
     set status = p_status,
         provider = coalesce(p_provider, provider),
         model = coalesce(p_model, model),
         error_message = p_error_message,
         updated_at = now()
   where id = p_request_id;

  if p_status <> 'available' then
    perform public.write_audit(
      'update'::public.audit_action, 'ai_assistance_requests', v_req.id,
      v_enc.practice_id, v_enc.patient_id,
      jsonb_build_object(
        'rpc','ai_assistance_save_result',
        'event', case p_status
          when 'processing' then 'ai_suggestion_processing'
          when 'failed' then 'ai_suggestion_failed'
          else 'ai_suggestion_unavailable'
        end,
        'encounter_id', v_enc.id
      )
    );
    return null;
  end if;

  select coalesce(max(version), 0) + 1 into v_ver
  from public.ai_assistance_results where request_id = p_request_id;

  insert into public.ai_assistance_results (
    request_id, organization_id, practice_id, patient_id, encounter_id,
    version, is_simulation, payload, review_status
  ) values (
    p_request_id, v_enc.organization_id, v_enc.practice_id, v_enc.patient_id, v_enc.id,
    v_ver, coalesce(p_is_simulation, false), coalesce(p_payload, '{}'::jsonb), 'pending'
  ) returning * into v_row;

  perform public.write_audit(
    'insert'::public.audit_action, 'ai_assistance_results', v_row.id,
    v_enc.practice_id, v_enc.patient_id,
    jsonb_build_object(
      'rpc','ai_assistance_save_result',
      'event','ai_suggestion_ready',
      'encounter_id', v_enc.id,
      'version', v_ver,
      'is_simulation', coalesce(p_is_simulation, false)
    )
  );
  return v_row;
end;
$$;

create or replace function public.ai_assistance_review(
  p_result_id uuid,
  p_action text,
  p_reviewed_payload jsonb default null
)
returns public.ai_assistance_results
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ai_assistance_results%rowtype;
  v_enc public.encounters%rowtype;
  v_status text;
begin
  select * into v_row from public.ai_assistance_results where id = p_result_id for update;
  if not found then raise exception 'RESULT_NOT_FOUND'; end if;
  v_enc := public.c0404_assert_encounter_writer(v_row.encounter_id);
  if v_enc.status is distinct from 'open'::public.encounter_status then
    raise exception 'ENCOUNTER_NOT_OPEN';
  end if;

  if p_action = 'accept' then
    v_status := 'accepted';
  elsif p_action = 'reject' then
    v_status := 'rejected';
  elsif p_action = 'edit_accept' then
    v_status := 'edited_accepted';
    if p_reviewed_payload is null then raise exception 'REVIEWED_PAYLOAD_REQUIRED'; end if;
  else
    raise exception 'INVALID_ACTION';
  end if;

  update public.ai_assistance_results
     set review_status = v_status,
         reviewed_payload = case when p_action = 'edit_accept' then p_reviewed_payload else reviewed_payload end,
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_result_id
  returning * into v_row;

  perform public.write_audit(
    'update'::public.audit_action, 'ai_assistance_results', v_row.id,
    v_enc.practice_id, v_enc.patient_id,
    jsonb_build_object(
      'rpc','ai_assistance_review',
      'event', case p_action
        when 'accept' then 'ai_suggestion_accepted'
        when 'reject' then 'ai_suggestion_rejected'
        else 'ai_suggestion_edited'
      end,
      'encounter_id', v_enc.id
    )
  );
  return v_row;
end;
$$;

create or replace function public.ai_assistance_list(p_encounter_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc public.encounters%rowtype;
begin
  v_enc := public.c0404_assert_encounter_writer(p_encounter_id);
  return jsonb_build_object(
    'requests', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at desc)
      from public.ai_assistance_requests r
      where r.encounter_id = v_enc.id
    ), '[]'::jsonb),
    'results', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from public.ai_assistance_results x
      where x.encounter_id = v_enc.id
    ), '[]'::jsonb)
  );
end;
$$;

-- Grants
revoke all on function public.clinical_exam_catalog_upsert(uuid, text, uuid, text, text, text, boolean, integer) from public, anon;
revoke all on function public.clinical_exam_group_upsert(uuid, text, uuid[], uuid, text, boolean, integer) from public, anon;
revoke all on function public.clinical_exam_request_create(uuid, uuid[], uuid[], text[], text, boolean) from public, anon;
revoke all on function public.clinical_exam_request_confirm(uuid) from public, anon;
revoke all on function public.prescription_template_upsert(uuid, text, jsonb, uuid, text, boolean) from public, anon;
revoke all on function public.prescription_template_apply(uuid, uuid) from public, anon;
revoke all on function public.ai_assistance_request_create(uuid, text, text) from public, anon;
revoke all on function public.ai_assistance_save_result(uuid, text, text, text, jsonb, boolean, text) from public, anon;
revoke all on function public.ai_assistance_review(uuid, text, jsonb) from public, anon;
revoke all on function public.ai_assistance_list(uuid) from public, anon;

grant execute on function public.clinical_exam_catalog_upsert(uuid, text, uuid, text, text, text, boolean, integer) to authenticated;
grant execute on function public.clinical_exam_group_upsert(uuid, text, uuid[], uuid, text, boolean, integer) to authenticated;
grant execute on function public.clinical_exam_request_create(uuid, uuid[], uuid[], text[], text, boolean) to authenticated;
grant execute on function public.clinical_exam_request_confirm(uuid) to authenticated;
grant execute on function public.prescription_template_upsert(uuid, text, jsonb, uuid, text, boolean) to authenticated;
grant execute on function public.prescription_template_apply(uuid, uuid) to authenticated;
grant execute on function public.ai_assistance_request_create(uuid, text, text) to authenticated;
grant execute on function public.ai_assistance_save_result(uuid, text, text, text, jsonb, boolean, text) to authenticated;
grant execute on function public.ai_assistance_review(uuid, text, jsonb) to authenticated;
grant execute on function public.ai_assistance_list(uuid) to authenticated;
