-- Cadastro completo de paciente (MPI da casa + ficha clínica de admissão).
-- Invariantes:
--   1. Identidade, contato e faturamento ficam em public.patients (cadastro da casa).
--   2. GPA, DUM/DPP, cirurgias, comorbidades, medicações e alergias ficam em
--      public.patient_clinical_data (1:1). Não substitui obstetric_followups
--      nem clinical_notes. Secretaria NÃO lê esta tabela.
--   3. Segurança da recepção: view public.patient_safety_flags (alergias/medicações).
--   4. Idade não é persistida: deriva de birth_date.
--   5. DPP (edd) é recalculada a partir da DUM (Naegele: +280 dias)
--      quando a DUM muda e não há edd_override.

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
-- Ficha clínica de admissão (PEP básico GO) — não é evolução
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
  'Histórico clínico de cadastro (GPA, DUM/DPP, alergias). Isolado das notas de consulta. Secretaria não acessa esta tabela.';

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
-- Camada de segurança da recepção (não é prontuário)
-- ---------------------------------------------------------------------------

create or replace view public.patient_safety_flags
with (security_invoker = false)
as
select
  c.patient_id,
  c.organization_id,
  (nullif(btrim(coalesce(c.allergies, '')), '') is not null) as has_allergies,
  c.allergies,
  (nullif(btrim(coalesce(c.continuous_medications, '')), '') is not null) as has_continuous_medications,
  c.continuous_medications
from public.patient_clinical_data c
where public.is_house_staff(
    c.organization_id,
    array['owner', 'admin', 'secretary', 'physician']::public.app_role[]
  )
  or exists (
    select 1
    from public.patient_practice_links l
    where l.patient_id = c.patient_id
      and public.has_practice_role(l.practice_id, array['physician']::public.app_role[])
  )
  or public.is_patient_self(c.patient_id);

comment on view public.patient_safety_flags is
  'Alergias e medicações contínuas para operação segura da recepção. Não inclui GPA, DUM/DPP, comorbidades nem evolução. Não substitui RLS de patient_clinical_data.';

grant select on public.patient_safety_flags to authenticated;

-- ---------------------------------------------------------------------------
-- RLS da ficha clínica: physician da casa, paciente (próprio), break-glass
-- ---------------------------------------------------------------------------

alter table public.patient_clinical_data enable row level security;

create policy patient_clinical_data_physician_select on public.patient_clinical_data
  for select using (
    public.is_house_staff(organization_id, array['physician']::public.app_role[])
    or public.is_patient_self(patient_id)
    or exists (
      select 1
      from public.break_glass_grants g
      join public.practice_units pu on pu.id = g.practice_id
      where g.user_id = auth.uid()
        and g.patient_id = patient_clinical_data.patient_id
        and pu.organization_id = patient_clinical_data.organization_id
        and g.starts_at <= now()
        and g.expires_at > now()
    )
  );

create policy patient_clinical_data_physician_insert on public.patient_clinical_data
  for insert with check (
    public.is_house_staff(organization_id, array['physician']::public.app_role[])
  );

create policy patient_clinical_data_physician_update on public.patient_clinical_data
  for update using (
    public.is_house_staff(organization_id, array['physician']::public.app_role[])
  )
  with check (
    public.is_house_staff(organization_id, array['physician']::public.app_role[])
  );
