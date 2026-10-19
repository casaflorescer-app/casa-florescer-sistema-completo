-- C060 — Gestão Clínica: especialidades, força de trabalho, contratos clínicos.
-- Aditiva. NÃO aplica automaticamente (db push exige autorização expressa).
-- Reutiliza rooms, professionals, rental_contracts, patients.
-- NÃO confunde médico locatário com funcionário.

-- ---------------------------------------------------------------------------
-- 1) Especialidades (catálogo administrativo)
-- ---------------------------------------------------------------------------

create table if not exists public.clinic_specialties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null,
  slug text not null,
  description text,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_specialties_name_chk check (char_length(btrim(name)) >= 2),
  constraint clinic_specialties_slug_chk check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create unique index if not exists clinic_specialties_org_slug_uidx
  on public.clinic_specialties (organization_id, slug);

create unique index if not exists clinic_specialties_org_name_uidx
  on public.clinic_specialties (organization_id, lower(btrim(name)));

create index if not exists clinic_specialties_org_active_idx
  on public.clinic_specialties (organization_id, is_active, name);

comment on table public.clinic_specialties is
  'C060: catálogo de especialidades da clínica. Não é cargo/função de RH.';

create table if not exists public.professional_specialties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  professional_id uuid not null references public.professionals (id) on delete cascade,
  specialty_id uuid not null references public.clinic_specialties (id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  constraint professional_specialties_uidx unique (professional_id, specialty_id)
);

create index if not exists professional_specialties_specialty_idx
  on public.professional_specialties (specialty_id);

comment on table public.professional_specialties is
  'C060: vínculo profissional ↔ especialidade (M2M).';

alter table public.rental_contracts
  add column if not exists specialty_id uuid references public.clinic_specialties (id);

comment on column public.rental_contracts.specialty_id is
  'C060: especialidade do catálogo (opcional). tenant_specialty text permanece.';

-- ---------------------------------------------------------------------------
-- 2) Força de trabalho (funcionários / prestadores) — NÃO é professional
-- ---------------------------------------------------------------------------

create table if not exists public.clinic_workforce (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  full_name text not null,
  document_cpf text,
  phone text,
  email text,
  role_title text not null,
  engagement_kind text not null default 'employee'
    check (engagement_kind in ('employee', 'contractor', 'other')),
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  starts_on date,
  ends_on date,
  notes text,
  linked_profile_id uuid references public.profiles (id),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_workforce_name_chk check (char_length(btrim(full_name)) >= 2),
  constraint clinic_workforce_role_chk check (char_length(btrim(role_title)) >= 2),
  constraint clinic_workforce_dates_chk check (
    ends_on is null or starts_on is null or ends_on >= starts_on
  )
);

create index if not exists clinic_workforce_org_status_idx
  on public.clinic_workforce (organization_id, status, full_name);

create index if not exists clinic_workforce_org_role_idx
  on public.clinic_workforce (organization_id, role_title);

comment on table public.clinic_workforce is
  'C060: funcionários e prestadores da clínica. Distinto de professionals (médicos/locatários).';

-- ---------------------------------------------------------------------------
-- 3) Contrato de disponibilidade obstétrica (vinculado à PACIENTE)
-- ---------------------------------------------------------------------------

create table if not exists public.obstetric_availability_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid references public.practice_units (id),
  patient_id uuid not null references public.patients (id),
  professional_id uuid not null references public.professionals (id),
  contract_code text,
  status text not null default 'active'
    check (status in ('draft', 'active', 'ended', 'cancelled')),
  contracted_on date not null default (timezone('America/Sao_Paulo', now()))::date,
  starts_on date,
  ends_on date,
  includes_normal_birth boolean not null default false,
  includes_cesarean boolean not null default false,
  notes text,
  cancelled_at timestamptz,
  cancel_reason text,
  ended_at timestamptz,
  end_reason text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint obstetric_availability_contracts_type_chk check (
    includes_normal_birth or includes_cesarean
  ),
  constraint obstetric_availability_contracts_dates_chk check (
    ends_on is null or starts_on is null or ends_on >= starts_on
  )
);

create unique index if not exists obstetric_availability_contracts_org_code_uidx
  on public.obstetric_availability_contracts (organization_id, contract_code)
  where contract_code is not null;

create index if not exists obstetric_availability_contracts_patient_idx
  on public.obstetric_availability_contracts (patient_id, status);

create index if not exists obstetric_availability_contracts_org_status_idx
  on public.obstetric_availability_contracts (organization_id, status, contracted_on desc);

comment on table public.obstetric_availability_contracts is
  'C060: contrato administrativo de disponibilidade obstétrica. NÃO é pré-natal clínico.';

create table if not exists public.obstetric_availability_contract_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  contract_id uuid not null references public.obstetric_availability_contracts (id) on delete cascade,
  event_kind text not null check (
    event_kind in ('created', 'updated', 'ended', 'cancelled')
  ),
  actor_id uuid references public.profiles (id),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists obstetric_availability_contract_events_idx
  on public.obstetric_availability_contract_events (contract_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4) Acordo/termo de procedimento (paciente + procedimento + rastreio)
-- ---------------------------------------------------------------------------

create table if not exists public.procedure_agreements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid references public.practice_units (id),
  patient_id uuid not null references public.patients (id),
  professional_id uuid references public.professionals (id),
  encounter_id uuid references public.encounters (id),
  procedure_name text not null,
  agreement_kind text not null default 'risk_acknowledgment'
    check (agreement_kind in ('procedure_contract', 'risk_acknowledgment', 'other')),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'superseded', 'cancelled')),
  version_number integer not null default 1 check (version_number >= 1),
  title text not null,
  term_body text,
  acknowledged_at timestamptz,
  acknowledged_by_name text,
  document_artifact_id uuid,
  notes text,
  superseded_by_id uuid references public.procedure_agreements (id),
  cancelled_at timestamptz,
  cancel_reason text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint procedure_agreements_name_chk check (char_length(btrim(procedure_name)) >= 2),
  constraint procedure_agreements_title_chk check (char_length(btrim(title)) >= 2)
);

-- FK opcional a clinical_document_artifacts (pode não existir em ambientes parciais)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'clinical_document_artifacts'
  ) then
    alter table public.procedure_agreements
      drop constraint if exists procedure_agreements_document_artifact_fk;
    alter table public.procedure_agreements
      add constraint procedure_agreements_document_artifact_fk
      foreign key (document_artifact_id)
      references public.clinical_document_artifacts (id);
  end if;
end $$;

create index if not exists procedure_agreements_patient_idx
  on public.procedure_agreements (patient_id, status);

create index if not exists procedure_agreements_org_status_idx
  on public.procedure_agreements (organization_id, status, created_at desc);

comment on table public.procedure_agreements is
  'C060: contrato/termo de procedimento com rastreabilidade. Termo ≠ checkbox.';

create table if not exists public.procedure_agreement_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  agreement_id uuid not null references public.procedure_agreements (id) on delete cascade,
  event_kind text not null check (
    event_kind in ('created', 'updated', 'acknowledged', 'superseded', 'cancelled')
  ),
  actor_id uuid references public.profiles (id),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists procedure_agreement_events_idx
  on public.procedure_agreement_events (agreement_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 5) RLS
-- ---------------------------------------------------------------------------

alter table public.clinic_specialties enable row level security;
alter table public.professional_specialties enable row level security;
alter table public.clinic_workforce enable row level security;
alter table public.obstetric_availability_contracts enable row level security;
alter table public.obstetric_availability_contract_events enable row level security;
alter table public.procedure_agreements enable row level security;
alter table public.procedure_agreement_events enable row level security;

drop policy if exists clinic_specialties_house on public.clinic_specialties;
create policy clinic_specialties_house on public.clinic_specialties
  for all using (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  )
  with check (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  );

-- Médica/secretaria: leitura do catálogo (filtros clínicos), sem mutação
drop policy if exists clinic_specialties_staff_select on public.clinic_specialties;
create policy clinic_specialties_staff_select on public.clinic_specialties
  for select using (
    public.is_house_staff(organization_id, array['physician', 'secretary']::public.app_role[])
    and is_active = true
  );

drop policy if exists professional_specialties_house on public.professional_specialties;
create policy professional_specialties_house on public.professional_specialties
  for all using (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  )
  with check (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  );

drop policy if exists professional_specialties_staff_select on public.professional_specialties;
create policy professional_specialties_staff_select on public.professional_specialties
  for select using (
    public.is_house_staff(organization_id, array['physician', 'secretary']::public.app_role[])
  );

drop policy if exists clinic_workforce_house on public.clinic_workforce;
create policy clinic_workforce_house on public.clinic_workforce
  for all using (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  )
  with check (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  );

drop policy if exists obstetric_availability_contracts_house on public.obstetric_availability_contracts;
create policy obstetric_availability_contracts_house on public.obstetric_availability_contracts
  for all using (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  )
  with check (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  );

-- Médica: leitura somente se puder ler o prontuário da paciente (practice, patient)
drop policy if exists obstetric_availability_contracts_physician_select on public.obstetric_availability_contracts;
create policy obstetric_availability_contracts_physician_select on public.obstetric_availability_contracts
  for select using (
    practice_id is not null
    and public.can_read_clinical(practice_id, patient_id)
  );

drop policy if exists obstetric_availability_contract_events_house on public.obstetric_availability_contract_events;
create policy obstetric_availability_contract_events_house on public.obstetric_availability_contract_events
  for all using (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  )
  with check (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  );

drop policy if exists procedure_agreements_house on public.procedure_agreements;
create policy procedure_agreements_house on public.procedure_agreements
  for all using (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  )
  with check (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  );

drop policy if exists procedure_agreements_physician_select on public.procedure_agreements;
create policy procedure_agreements_physician_select on public.procedure_agreements
  for select using (
    practice_id is not null
    and public.can_read_clinical(practice_id, patient_id)
  );

drop policy if exists procedure_agreement_events_house on public.procedure_agreement_events;
create policy procedure_agreement_events_house on public.procedure_agreement_events
  for all using (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  )
  with check (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  );

-- ---------------------------------------------------------------------------
-- 6) Helpers / RPCs
-- ---------------------------------------------------------------------------

create or replace function public.clinic_specialty_slugify(p_name text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v text;
begin
  v := lower(trim(both from coalesce(p_name, '')));
  v := translate(v,
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn');
  v := regexp_replace(v, '[^a-z0-9]+', '-', 'g');
  v := regexp_replace(v, '(^-|-$)', '', 'g');
  if v = '' then
    v := 'especialidade';
  end if;
  return v;
end;
$$;

create or replace function public.clinic_specialty_upsert(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := (p_payload->>'organization_id')::uuid;
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_name text := btrim(coalesce(p_payload->>'name', ''));
  v_desc text := nullif(btrim(coalesce(p_payload->>'description', '')), '');
  v_active boolean := coalesce((p_payload->>'is_active')::boolean, true);
  v_slug text;
begin
  if v_org is null or not public.is_house_staff(v_org, array['owner', 'admin']::public.app_role[]) then
    raise exception 'CLINIC_SPECIALTY_FORBIDDEN' using errcode = '42501';
  end if;
  if char_length(v_name) < 2 then
    raise exception 'CLINIC_SPECIALTY_NAME_REQUIRED' using errcode = '22023';
  end if;
  v_slug := public.clinic_specialty_slugify(v_name);

  if v_id is null then
    insert into public.clinic_specialties (
      organization_id, name, slug, description, is_active, created_by
    ) values (
      v_org, v_name, v_slug, v_desc, v_active, public.current_profile_id()
    )
    returning id into v_id;
    perform public.write_audit(
      'insert'::public.audit_action,
      'clinic_specialties',
      v_id,
      null,
      null,
      jsonb_build_object('name', v_name, 'source', 'c060')
    );
  else
    update public.clinic_specialties
       set name = v_name,
           slug = v_slug,
           description = v_desc,
           is_active = v_active,
           updated_at = now()
     where id = v_id
       and organization_id = v_org;
    if not found then
      raise exception 'CLINIC_SPECIALTY_NOT_FOUND' using errcode = 'P0002';
    end if;
    perform public.write_audit(
      'update'::public.audit_action,
      'clinic_specialties',
      v_id,
      null,
      null,
      jsonb_build_object('name', v_name, 'is_active', v_active, 'source', 'c060')
    );
  end if;
  return v_id;
end;
$$;

create or replace function public.professional_specialty_set(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := (p_payload->>'organization_id')::uuid;
  v_prof uuid := (p_payload->>'professional_id')::uuid;
  v_spec uuid := (p_payload->>'specialty_id')::uuid;
  v_primary boolean := coalesce((p_payload->>'is_primary')::boolean, false);
  v_op text := coalesce(p_payload->>'op', 'link');
begin
  if v_org is null or v_prof is null or v_spec is null then
    raise exception 'PROFESSIONAL_SPECIALTY_PAYLOAD' using errcode = '22023';
  end if;
  if not public.is_house_staff(v_org, array['owner', 'admin']::public.app_role[]) then
    raise exception 'PROFESSIONAL_SPECIALTY_FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.professionals p
    where p.id = v_prof and p.organization_id = v_org
  ) then
    raise exception 'PROFESSIONAL_SPECIALTY_PROF_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.clinic_specialties s
    where s.id = v_spec and s.organization_id = v_org
  ) then
    raise exception 'PROFESSIONAL_SPECIALTY_SPEC_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_op = 'unlink' then
    delete from public.professional_specialties
    where organization_id = v_org
      and professional_id = v_prof
      and specialty_id = v_spec;
    perform public.write_audit(
      'delete'::public.audit_action,
      'professional_specialties',
      v_prof,
      null,
      null,
      jsonb_build_object('specialty_id', v_spec, 'op', 'unlink', 'source', 'c060')
    );
    return;
  end if;

  if v_primary then
    update public.professional_specialties
       set is_primary = false
     where organization_id = v_org
       and professional_id = v_prof;
  end if;

  insert into public.professional_specialties (
    organization_id, professional_id, specialty_id, is_primary
  ) values (v_org, v_prof, v_spec, v_primary)
  on conflict (professional_id, specialty_id) do update
    set is_primary = excluded.is_primary;

  perform public.write_audit(
    'insert'::public.audit_action,
    'professional_specialties',
    v_prof,
    null,
    null,
    jsonb_build_object('specialty_id', v_spec, 'is_primary', v_primary, 'source', 'c060')
  );
end;
$$;

create or replace function public.clinic_workforce_upsert(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := (p_payload->>'organization_id')::uuid;
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_name text := btrim(coalesce(p_payload->>'full_name', ''));
  v_role text := btrim(coalesce(p_payload->>'role_title', ''));
  v_kind text := coalesce(nullif(p_payload->>'engagement_kind', ''), 'employee');
  v_status text := coalesce(nullif(p_payload->>'status', ''), 'active');
begin
  if v_org is null or not public.is_house_staff(v_org, array['owner', 'admin']::public.app_role[]) then
    raise exception 'CLINIC_WORKFORCE_FORBIDDEN' using errcode = '42501';
  end if;
  if char_length(v_name) < 2 or char_length(v_role) < 2 then
    raise exception 'CLINIC_WORKFORCE_REQUIRED' using errcode = '22023';
  end if;
  if v_kind not in ('employee', 'contractor', 'other') then
    raise exception 'CLINIC_WORKFORCE_KIND' using errcode = '22023';
  end if;
  if v_status not in ('active', 'inactive') then
    raise exception 'CLINIC_WORKFORCE_STATUS' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.clinic_workforce (
      organization_id, full_name, document_cpf, phone, email, role_title,
      engagement_kind, status, starts_on, ends_on, notes, linked_profile_id, created_by
    ) values (
      v_org,
      v_name,
      nullif(btrim(coalesce(p_payload->>'document_cpf', '')), ''),
      nullif(btrim(coalesce(p_payload->>'phone', '')), ''),
      nullif(btrim(coalesce(p_payload->>'email', '')), ''),
      v_role,
      v_kind,
      v_status,
      nullif(p_payload->>'starts_on', '')::date,
      nullif(p_payload->>'ends_on', '')::date,
      nullif(btrim(coalesce(p_payload->>'notes', '')), ''),
      nullif(p_payload->>'linked_profile_id', '')::uuid,
      public.current_profile_id()
    )
    returning id into v_id;
    perform public.write_audit(
      'insert'::public.audit_action,
      'clinic_workforce',
      v_id,
      null,
      null,
      jsonb_build_object('full_name', v_name, 'role_title', v_role, 'source', 'c060')
    );
  else
    update public.clinic_workforce
       set full_name = v_name,
           document_cpf = nullif(btrim(coalesce(p_payload->>'document_cpf', '')), ''),
           phone = nullif(btrim(coalesce(p_payload->>'phone', '')), ''),
           email = nullif(btrim(coalesce(p_payload->>'email', '')), ''),
           role_title = v_role,
           engagement_kind = v_kind,
           status = v_status,
           starts_on = nullif(p_payload->>'starts_on', '')::date,
           ends_on = nullif(p_payload->>'ends_on', '')::date,
           notes = nullif(btrim(coalesce(p_payload->>'notes', '')), ''),
           linked_profile_id = nullif(p_payload->>'linked_profile_id', '')::uuid,
           updated_at = now()
     where id = v_id and organization_id = v_org;
    if not found then
      raise exception 'CLINIC_WORKFORCE_NOT_FOUND' using errcode = 'P0002';
    end if;
    perform public.write_audit(
      'update'::public.audit_action,
      'clinic_workforce',
      v_id,
      null,
      null,
      jsonb_build_object('full_name', v_name, 'status', v_status, 'source', 'c060')
    );
  end if;
  return v_id;
end;
$$;

create or replace function public.obstetric_availability_contract_next_code(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year text := to_char(timezone('America/Sao_Paulo', now()), 'YYYY');
  v_seq int;
begin
  select coalesce(max(
    nullif(regexp_replace(contract_code, '^CF-OBS-' || v_year || '-', ''), '')::int
  ), 0) + 1
    into v_seq
  from public.obstetric_availability_contracts
  where organization_id = p_organization_id
    and contract_code ~ ('^CF-OBS-' || v_year || '-[0-9]+$');
  return 'CF-OBS-' || v_year || '-' || lpad(v_seq::text, 4, '0');
end;
$$;

create or replace function public.obstetric_availability_contract_create(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := (p_payload->>'organization_id')::uuid;
  v_patient uuid := (p_payload->>'patient_id')::uuid;
  v_prof uuid := (p_payload->>'professional_id')::uuid;
  v_practice uuid;
  v_id uuid;
  v_code text;
  v_normal boolean := coalesce((p_payload->>'includes_normal_birth')::boolean, false);
  v_cesarean boolean := coalesce((p_payload->>'includes_cesarean')::boolean, false);
begin
  if v_org is null or not public.is_house_staff(v_org, array['owner', 'admin']::public.app_role[]) then
    raise exception 'OBS_CONTRACT_FORBIDDEN' using errcode = '42501';
  end if;
  if v_patient is null or v_prof is null then
    raise exception 'OBS_CONTRACT_REQUIRED' using errcode = '22023';
  end if;
  if not (v_normal or v_cesarean) then
    raise exception 'OBS_CONTRACT_AVAILABILITY_REQUIRED' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.patients p
    where p.id = v_patient and p.organization_id = v_org
  ) then
    raise exception 'OBS_CONTRACT_PATIENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.professionals pr
    where pr.id = v_prof and pr.organization_id = v_org
  ) then
    raise exception 'OBS_CONTRACT_PROF_NOT_FOUND' using errcode = 'P0002';
  end if;

  select pr.practice_id into v_practice
  from public.professionals pr where pr.id = v_prof;

  v_code := public.obstetric_availability_contract_next_code(v_org);

  insert into public.obstetric_availability_contracts (
    organization_id, practice_id, patient_id, professional_id, contract_code,
    status, contracted_on, starts_on, ends_on,
    includes_normal_birth, includes_cesarean, notes, created_by
  ) values (
    v_org,
    coalesce(nullif(p_payload->>'practice_id', '')::uuid, v_practice),
    v_patient,
    v_prof,
    v_code,
    coalesce(nullif(p_payload->>'status', ''), 'active'),
    coalesce(nullif(p_payload->>'contracted_on', '')::date, (timezone('America/Sao_Paulo', now()))::date),
    nullif(p_payload->>'starts_on', '')::date,
    nullif(p_payload->>'ends_on', '')::date,
    v_normal,
    v_cesarean,
    nullif(btrim(coalesce(p_payload->>'notes', '')), ''),
    public.current_profile_id()
  )
  returning id into v_id;

  insert into public.obstetric_availability_contract_events (
    organization_id, contract_id, event_kind, actor_id, detail
  ) values (
    v_org, v_id, 'created', public.current_profile_id(),
    jsonb_build_object('contract_code', v_code, 'source', 'c060')
  );

  perform public.write_audit(
    'insert'::public.audit_action,
    'obstetric_availability_contracts',
    v_id,
    v_practice,
    v_patient,
    jsonb_build_object('contract_code', v_code, 'source', 'c060')
  );
  return v_id;
end;
$$;

create or replace function public.obstetric_availability_contract_update(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := (p_payload->>'organization_id')::uuid;
  v_id uuid := (p_payload->>'id')::uuid;
  v_patient uuid;
begin
  if v_org is null or v_id is null
     or not public.is_house_staff(v_org, array['owner', 'admin']::public.app_role[]) then
    raise exception 'OBS_CONTRACT_FORBIDDEN' using errcode = '42501';
  end if;

  update public.obstetric_availability_contracts
     set professional_id = coalesce(nullif(p_payload->>'professional_id', '')::uuid, professional_id),
         contracted_on = coalesce(nullif(p_payload->>'contracted_on', '')::date, contracted_on),
         starts_on = case when p_payload ? 'starts_on' then nullif(p_payload->>'starts_on', '')::date else starts_on end,
         ends_on = case when p_payload ? 'ends_on' then nullif(p_payload->>'ends_on', '')::date else ends_on end,
         includes_normal_birth = coalesce((p_payload->>'includes_normal_birth')::boolean, includes_normal_birth),
         includes_cesarean = coalesce((p_payload->>'includes_cesarean')::boolean, includes_cesarean),
         notes = case when p_payload ? 'notes' then nullif(btrim(coalesce(p_payload->>'notes', '')), '') else notes end,
         updated_at = now()
   where id = v_id and organization_id = v_org
     and status in ('draft', 'active')
  returning patient_id into v_patient;

  if not found then
    raise exception 'OBS_CONTRACT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.obstetric_availability_contracts
    where id = v_id and (includes_normal_birth or includes_cesarean)
  ) then
    raise exception 'OBS_CONTRACT_AVAILABILITY_REQUIRED' using errcode = '22023';
  end if;

  insert into public.obstetric_availability_contract_events (
    organization_id, contract_id, event_kind, actor_id, detail
  ) values (
    v_org, v_id, 'updated', public.current_profile_id(),
    jsonb_build_object('source', 'c060')
  );

  perform public.write_audit(
    'update'::public.audit_action,
    'obstetric_availability_contracts',
    v_id,
    null,
    v_patient,
    jsonb_build_object('source', 'c060')
  );
  return v_id;
end;
$$;

create or replace function public.obstetric_availability_contract_end(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := (p_payload->>'organization_id')::uuid;
  v_id uuid := (p_payload->>'id')::uuid;
  v_patient uuid;
  v_kind text := coalesce(nullif(p_payload->>'op', ''), 'end');
begin
  if v_org is null or v_id is null
     or not public.is_house_staff(v_org, array['owner', 'admin']::public.app_role[]) then
    raise exception 'OBS_CONTRACT_FORBIDDEN' using errcode = '42501';
  end if;

  if v_kind = 'cancel' then
    update public.obstetric_availability_contracts
       set status = 'cancelled',
           cancelled_at = now(),
           cancel_reason = nullif(btrim(coalesce(p_payload->>'reason', '')), ''),
           updated_at = now()
     where id = v_id and organization_id = v_org and status in ('draft', 'active')
    returning patient_id into v_patient;
  else
    update public.obstetric_availability_contracts
       set status = 'ended',
           ended_at = now(),
           end_reason = nullif(btrim(coalesce(p_payload->>'reason', '')), ''),
           updated_at = now()
     where id = v_id and organization_id = v_org and status in ('draft', 'active')
    returning patient_id into v_patient;
  end if;

  if not found then
    raise exception 'OBS_CONTRACT_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.obstetric_availability_contract_events (
    organization_id, contract_id, event_kind, actor_id, detail
  ) values (
    v_org, v_id, case when v_kind = 'cancel' then 'cancelled' else 'ended' end,
    public.current_profile_id(),
    jsonb_build_object('reason', p_payload->>'reason', 'source', 'c060')
  );

  perform public.write_audit(
    'update'::public.audit_action,
    'obstetric_availability_contracts',
    v_id,
    null,
    v_patient,
    jsonb_build_object('op', v_kind, 'source', 'c060')
  );
  return v_id;
end;
$$;

create or replace function public.procedure_agreement_create(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := (p_payload->>'organization_id')::uuid;
  v_patient uuid := (p_payload->>'patient_id')::uuid;
  v_id uuid;
  v_title text := btrim(coalesce(p_payload->>'title', ''));
  v_proc text := btrim(coalesce(p_payload->>'procedure_name', ''));
  v_kind text := coalesce(nullif(p_payload->>'agreement_kind', ''), 'risk_acknowledgment');
  v_practice uuid := nullif(p_payload->>'practice_id', '')::uuid;
begin
  if v_org is null or not public.is_house_staff(v_org, array['owner', 'admin']::public.app_role[]) then
    raise exception 'PROC_AGREEMENT_FORBIDDEN' using errcode = '42501';
  end if;
  if v_patient is null or char_length(v_title) < 2 or char_length(v_proc) < 2 then
    raise exception 'PROC_AGREEMENT_REQUIRED' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.patients p where p.id = v_patient and p.organization_id = v_org
  ) then
    raise exception 'PROC_AGREEMENT_PATIENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.procedure_agreements (
    organization_id, practice_id, patient_id, professional_id, encounter_id,
    procedure_name, agreement_kind, status, version_number, title, term_body,
    notes, created_by
  ) values (
    v_org,
    v_practice,
    v_patient,
    nullif(p_payload->>'professional_id', '')::uuid,
    nullif(p_payload->>'encounter_id', '')::uuid,
    v_proc,
    v_kind,
    coalesce(nullif(p_payload->>'status', ''), 'draft'),
    1,
    v_title,
    nullif(p_payload->>'term_body', ''),
    nullif(btrim(coalesce(p_payload->>'notes', '')), ''),
    public.current_profile_id()
  )
  returning id into v_id;

  insert into public.procedure_agreement_events (
    organization_id, agreement_id, event_kind, actor_id, detail
  ) values (
    v_org, v_id, 'created', public.current_profile_id(),
    jsonb_build_object('procedure_name', v_proc, 'source', 'c060')
  );

  perform public.write_audit(
    'insert'::public.audit_action,
    'procedure_agreements',
    v_id,
    v_practice,
    v_patient,
    jsonb_build_object('procedure_name', v_proc, 'agreement_kind', v_kind, 'source', 'c060')
  );
  return v_id;
end;
$$;

create or replace function public.procedure_agreement_acknowledge(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := (p_payload->>'organization_id')::uuid;
  v_id uuid := (p_payload->>'id')::uuid;
  v_patient uuid;
  v_by text := nullif(btrim(coalesce(p_payload->>'acknowledged_by_name', '')), '');
begin
  if v_org is null or v_id is null
     or not public.is_house_staff(v_org, array['owner', 'admin']::public.app_role[]) then
    raise exception 'PROC_AGREEMENT_FORBIDDEN' using errcode = '42501';
  end if;
  if v_by is null then
    raise exception 'PROC_AGREEMENT_ACK_NAME_REQUIRED' using errcode = '22023';
  end if;

  update public.procedure_agreements
     set status = 'active',
         acknowledged_at = now(),
         acknowledged_by_name = v_by,
         updated_at = now()
   where id = v_id and organization_id = v_org and status in ('draft', 'active')
  returning patient_id into v_patient;

  if not found then
    raise exception 'PROC_AGREEMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.procedure_agreement_events (
    organization_id, agreement_id, event_kind, actor_id, detail
  ) values (
    v_org, v_id, 'acknowledged', public.current_profile_id(),
    jsonb_build_object('acknowledged_by_name', v_by, 'source', 'c060')
  );

  perform public.write_audit(
    'update'::public.audit_action,
    'procedure_agreements',
    v_id,
    null,
    v_patient,
    jsonb_build_object('op', 'acknowledge', 'source', 'c060')
  );
  return v_id;
end;
$$;

create or replace function public.procedure_agreement_cancel(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := (p_payload->>'organization_id')::uuid;
  v_id uuid := (p_payload->>'id')::uuid;
  v_patient uuid;
begin
  if v_org is null or v_id is null
     or not public.is_house_staff(v_org, array['owner', 'admin']::public.app_role[]) then
    raise exception 'PROC_AGREEMENT_FORBIDDEN' using errcode = '42501';
  end if;

  update public.procedure_agreements
     set status = 'cancelled',
         cancelled_at = now(),
         cancel_reason = nullif(btrim(coalesce(p_payload->>'reason', '')), ''),
         updated_at = now()
   where id = v_id and organization_id = v_org and status in ('draft', 'active')
  returning patient_id into v_patient;

  if not found then
    raise exception 'PROC_AGREEMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.procedure_agreement_events (
    organization_id, agreement_id, event_kind, actor_id, detail
  ) values (
    v_org, v_id, 'cancelled', public.current_profile_id(),
    jsonb_build_object('reason', p_payload->>'reason', 'source', 'c060')
  );

  perform public.write_audit(
    'update'::public.audit_action,
    'procedure_agreements',
    v_id,
    null,
    v_patient,
    jsonb_build_object('op', 'cancel', 'source', 'c060')
  );
  return v_id;
end;
$$;

-- Grants
revoke all on function public.clinic_specialty_slugify(text) from public;
revoke all on function public.clinic_specialty_upsert(jsonb) from public;
revoke all on function public.professional_specialty_set(jsonb) from public;
revoke all on function public.clinic_workforce_upsert(jsonb) from public;
revoke all on function public.obstetric_availability_contract_next_code(uuid) from public;
revoke all on function public.obstetric_availability_contract_create(jsonb) from public;
revoke all on function public.obstetric_availability_contract_update(jsonb) from public;
revoke all on function public.obstetric_availability_contract_end(jsonb) from public;
revoke all on function public.procedure_agreement_create(jsonb) from public;
revoke all on function public.procedure_agreement_acknowledge(jsonb) from public;
revoke all on function public.procedure_agreement_cancel(jsonb) from public;

grant execute on function public.clinic_specialty_slugify(text) to authenticated;
grant execute on function public.clinic_specialty_upsert(jsonb) to authenticated;
grant execute on function public.professional_specialty_set(jsonb) to authenticated;
grant execute on function public.clinic_workforce_upsert(jsonb) to authenticated;
grant execute on function public.obstetric_availability_contract_next_code(uuid) to authenticated;
grant execute on function public.obstetric_availability_contract_create(jsonb) to authenticated;
grant execute on function public.obstetric_availability_contract_update(jsonb) to authenticated;
grant execute on function public.obstetric_availability_contract_end(jsonb) to authenticated;
grant execute on function public.procedure_agreement_create(jsonb) to authenticated;
grant execute on function public.procedure_agreement_acknowledge(jsonb) to authenticated;
grant execute on function public.procedure_agreement_cancel(jsonb) to authenticated;
