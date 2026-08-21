-- Cadastro completo de paciente (MPI da casa + ficha clínica de admissão).
-- Invariantes:
--   1. Identidade, contato e faturamento ficam em public.patients (cadastro da casa).
--   2. GPA, DUM/DPP, cirurgias, comorbidades, medicações e alergias ficam em
--      public.patient_clinical_data (1:1 com o paciente). Não substitui
--      obstetric_followups nem clinical_notes (prontuário isolado por prática).
--   3. Idade não é persistida: deriva de birth_date.
--   4. DPP (edd) é recalculada a partir da DUM (regra de Naegele: +280 dias)
--      quando a DUM muda e a médica ainda não informou um edd_override.

create type public.care_specialty as enum ('gynecology', 'obstetrics');
create type public.billing_modality as enum ('private', 'insurance');
create type public.private_payment_method as enum ('pix', 'card', 'cash');

-- ---------------------------------------------------------------------------
-- MPI: contato, endereço e faturamento
-- ---------------------------------------------------------------------------

alter table public.patients
  add column if not exists address_street text,
  add column if not exists address_number text,
  add column if not exists address_complement text,
  add column if not exists address_district text,
  add column if not exists address_city text,
  add column if not exists address_state char(2),
  add column if not exists address_cep char(8),
  add column if not exists care_specialties public.care_specialty[] not null default '{}'::public.care_specialty[],
  add column if not exists billing_modality public.billing_modality,
  add column if not exists insurance_name text,
  add column if not exists insurance_card_number text,
  add column if not exists insurance_valid_until date,
  add column if not exists private_payment_method public.private_payment_method,
  add column if not exists updated_at timestamptz not null default now();

alter table public.patients
  drop constraint if exists patients_cpf_digits;
alter table public.patients
  add constraint patients_cpf_digits
  check (cpf is null or cpf ~ '^[0-9]{11}$');

alter table public.patients
  drop constraint if exists patients_cep_digits;
alter table public.patients
  add constraint patients_cep_digits
  check (address_cep is null or address_cep ~ '^[0-9]{8}$');

alter table public.patients
  drop constraint if exists patients_state_uf;
alter table public.patients
  add constraint patients_state_uf
  check (address_state is null or address_state ~ '^[A-Z]{2}$');

alter table public.patients
  drop constraint if exists patients_billing_shape;
alter table public.patients
  add constraint patients_billing_shape
  check (
    billing_modality is null
    or (
      billing_modality = 'insurance'
      and insurance_name is not null
      and insurance_card_number is not null
      and private_payment_method is null
    )
    or (
      billing_modality = 'private'
      and private_payment_method is not null
      and insurance_name is null
      and insurance_card_number is null
      and insurance_valid_until is null
    )
  );

comment on column public.patients.care_specialties is
  'Atendimento atual: ginecologia e/ou obstetrícia.';
comment on column public.patients.billing_modality is
  'Particular ou plano. Campos de convênio e Pix/cartão/dinheiro são mutuamente exclusivos.';

-- ---------------------------------------------------------------------------
-- Ficha clínica de admissão (PEP básico GO)
-- ---------------------------------------------------------------------------

create table public.patient_clinical_data (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null unique references public.patients (id) on delete cascade,
  organization_id uuid not null references public.organizations (id),
  pregnancies smallint not null default 0 check (pregnancies >= 0),
  births smallint not null default 0 check (births >= 0),
  abortions smallint not null default 0 check (abortions >= 0),
  lmp_date date,
  edd date,
  edd_override boolean not null default false,
  gyn_procedures text[] not null default '{}',
  comorbidities text,
  continuous_medications text,
  allergies text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  check (pregnancies >= births + abortions)
);

create index patient_clinical_data_org_idx
  on public.patient_clinical_data (organization_id);
create index patient_clinical_data_edd_idx
  on public.patient_clinical_data (edd)
  where edd is not null;

comment on table public.patient_clinical_data is
  'Histórico clínico de cadastro (GPA, DUM/DPP, alergias). Isolado das notas de consulta.';
comment on column public.patient_clinical_data.pregnancies is 'G — gestações (inclui a atual).';
comment on column public.patient_clinical_data.births is 'P — partos.';
comment on column public.patient_clinical_data.abortions is 'A — abortos.';
comment on column public.patient_clinical_data.lmp_date is 'DUM — data da última menstruação.';
comment on column public.patient_clinical_data.edd is 'DPP — data provável do parto.';

create or replace function public.naegele_edd(p_lmp date)
returns date
language sql
immutable
as $$
  select case when p_lmp is null then null else (p_lmp + 280) end
$$;

create or replace function public.patient_clinical_data_before_write()
returns trigger
language plpgsql
as $$
begin
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

drop trigger if exists patient_clinical_data_before_write on public.patient_clinical_data;
create trigger patient_clinical_data_before_write
  before insert or update on public.patient_clinical_data
  for each row execute function public.patient_clinical_data_before_write();

create or replace function public.patients_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists patients_touch_updated_at on public.patients;
create trigger patients_touch_updated_at
  before update on public.patients
  for each row execute function public.patients_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

create or replace function public.is_org_clinical_staff(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.user_practice_roles r on r.user_id = p.id
    where p.id = auth.uid()
      and p.organization_id = p_org
      and r.role in ('owner', 'admin', 'secretary', 'physician')
  )
$$;

alter table public.patient_clinical_data enable row level security;

drop policy if exists patients_staff_insert on public.patients;
create policy patients_staff_insert on public.patients
  for insert
  with check (public.is_org_clinical_staff(organization_id));

drop policy if exists patients_staff_update on public.patients;
create policy patients_staff_update on public.patients
  for update
  using (public.is_org_clinical_staff(organization_id))
  with check (public.is_org_clinical_staff(organization_id));

drop policy if exists patient_clinical_data_staff_read on public.patient_clinical_data;
create policy patient_clinical_data_staff_read on public.patient_clinical_data
  for select
  using (
    public.is_org_clinical_staff(organization_id)
    or public.is_patient_self(patient_id)
  );

drop policy if exists patient_clinical_data_staff_write on public.patient_clinical_data;
create policy patient_clinical_data_staff_write on public.patient_clinical_data
  for insert
  with check (public.is_org_clinical_staff(organization_id));

drop policy if exists patient_clinical_data_staff_update on public.patient_clinical_data;
create policy patient_clinical_data_staff_update on public.patient_clinical_data
  for update
  using (public.is_org_clinical_staff(organization_id))
  with check (public.is_org_clinical_staff(organization_id));
