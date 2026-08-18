-- Casa Florescer — núcleo multi-prática (Supabase / PostgreSQL 15+)
-- Invariantes:
--   1. Cadastro de paciente (MPI) é da casa; prontuário é da practice_unit.
--   2. Toda movimentação financeira nasce de uma regra de split versionada.
--   3. Estoque clínico usa lote/FEFO; copa usa saldo simples.
--   4. audit_events é append-only.

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.practice_kind as enum ('house', 'sublet');
create type public.room_status as enum ('active', 'maintenance', 'inactive');
create type public.occupancy_model as enum (
  'fixed_monthly',
  'hourly',
  'shift',
  'revenue_share',
  'hybrid'
);
create type public.app_role as enum (
  'owner',
  'admin',
  'physician',
  'secretary',
  'inventory',
  'finance'
);
create type public.clinical_access as enum ('none', 'own_encounters', 'practice', 'break_glass');
create type public.appointment_status as enum (
  'scheduled',
  'confirmed',
  'checked_in',
  'in_progress',
  'completed',
  'no_show',
  'cancelled'
);
create type public.encounter_status as enum ('open', 'signed', 'amended', 'cancelled');
create type public.payer_kind as enum ('private', 'insurance', 'courtesy', 'occupancy');
create type public.split_beneficiary_kind as enum (
  'house',
  'practice',
  'professional',
  'cost_center'
);
create type public.item_class as enum (
  'clinical_lot_controlled',
  'clinical_consumable',
  'pantry',
  'housekeeping',
  'office'
);
create type public.movement_kind as enum (
  'receipt',
  'procedure_consume',
  'pantry_consume',
  'transfer',
  'adjustment',
  'expiry_writeoff',
  'return'
);
create type public.charge_target as enum ('patient', 'practice', 'house', 'none');
create type public.audit_action as enum (
  'read',
  'insert',
  'update',
  'delete',
  'break_glass',
  'sign',
  'export'
);

-- ---------------------------------------------------------------------------
-- Identidade e ocupação física
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  trade_name text not null,
  cnpj char(14) not null unique,
  created_at timestamptz not null default now()
);

create table public.practice_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  kind public.practice_kind not null,
  code text not null,
  name text not null,
  specialty text not null,
  legal_name text,
  cnpj char(14),
  isolation_label text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  code text not null,
  name text not null,
  is_house boolean not null default false,
  status public.room_status not null default 'active',
  unique (organization_id, code)
);

create table public.occupancy_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  room_id uuid not null references public.rooms (id),
  model public.occupancy_model not null,
  starts_on date not null,
  ends_on date,
  fixed_amount_cents integer not null default 0 check (fixed_amount_cents >= 0),
  hourly_amount_cents integer not null default 0 check (hourly_amount_cents >= 0),
  revenue_share_bps integer not null default 0 check (revenue_share_bps between 0 and 10000),
  shared_cost_bps integer not null default 0 check (shared_cost_bps between 0 and 10000),
  pantry_included boolean not null default false,
  clinical_stock_billable boolean not null default true,
  unique (room_id, starts_on)
);

create index occupancy_contracts_practice_idx on public.occupancy_contracts (practice_id);

-- ---------------------------------------------------------------------------
-- Pessoas e autorização
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  organization_id uuid not null references public.organizations (id),
  full_name text not null,
  email citext not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.user_practice_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  practice_id uuid not null references public.practice_units (id) on delete cascade,
  role public.app_role not null,
  clinical_access public.clinical_access not null default 'none',
  can_cashier boolean not null default false,
  can_schedule_any_practice boolean not null default false,
  unique (user_id, practice_id, role)
);

create index user_practice_roles_user_idx on public.user_practice_roles (user_id);

create table public.professionals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id),
  practice_id uuid not null references public.practice_units (id),
  council_type text not null,
  council_number text not null,
  unique (practice_id, council_type, council_number)
);

-- ---------------------------------------------------------------------------
-- Paciente (MPI da casa) e vínculo clínico
-- ---------------------------------------------------------------------------

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  full_name text not null,
  social_name text,
  cpf char(11),
  birth_date date,
  phone text,
  email citext,
  created_at timestamptz not null default now(),
  unique (organization_id, cpf)
);

create index patients_name_idx on public.patients (organization_id, full_name);

create table public.patient_practice_links (
  patient_id uuid not null references public.patients (id) on delete cascade,
  practice_id uuid not null references public.practice_units (id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  primary key (patient_id, practice_id)
);

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  practice_id uuid not null references public.practice_units (id),
  purpose text not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Agenda e prontuário (isolamento por practice_id)
-- ---------------------------------------------------------------------------

create table public.procedures (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid references public.practice_units (id),
  organization_id uuid not null references public.organizations (id),
  code text not null,
  name text not null,
  duration_min integer not null default 30,
  is_shared boolean not null default false,
  unique (organization_id, code)
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  room_id uuid not null references public.rooms (id),
  patient_id uuid not null references public.patients (id),
  professional_id uuid not null references public.professionals (id),
  procedure_id uuid references public.procedures (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'scheduled',
  created_by uuid not null references public.profiles (id),
  check (ends_at > starts_at)
);

create index appointments_room_time_idx on public.appointments (room_id, starts_at);
create index appointments_practice_time_idx on public.appointments (practice_id, starts_at);

create table public.encounters (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practice_units (id),
  appointment_id uuid unique references public.appointments (id),
  patient_id uuid not null references public.patients (id),
  professional_id uuid not null references public.professionals (id),
  procedure_id uuid references public.procedures (id),
  status public.encounter_status not null default 'open',
  signed_at timestamptz,
  signed_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.clinical_notes (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.encounters (id) on delete restrict,
  practice_id uuid not null references public.practice_units (id),
  body_ciphertext text not null,
  template_code text,
  version integer not null default 1,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.break_glass_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  patient_id uuid not null references public.patients (id),
  practice_id uuid not null references public.practice_units (id),
  reason text not null,
  approved_by uuid references public.profiles (id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

-- ---------------------------------------------------------------------------
-- Financeiro: regras de split + ledger
-- ---------------------------------------------------------------------------

create table public.cost_centers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  code text not null,
  name text not null,
  is_shared boolean not null default false,
  unique (organization_id, code)
);

create table public.split_rule_sets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null,
  version integer not null,
  effective_from date not null,
  is_active boolean not null default true,
  unique (organization_id, name, version)
);

create table public.split_rules (
  id uuid primary key default gen_random_uuid(),
  rule_set_id uuid not null references public.split_rule_sets (id) on delete cascade,
  priority integer not null,
  practice_id uuid references public.practice_units (id),
  room_id uuid references public.rooms (id),
  procedure_id uuid references public.procedures (id),
  payer_kind public.payer_kind,
  beneficiary_kind public.split_beneficiary_kind not null,
  beneficiary_practice_id uuid references public.practice_units (id),
  beneficiary_professional_id uuid references public.professionals (id),
  beneficiary_cost_center_id uuid references public.cost_centers (id),
  share_bps integer not null check (share_bps between 0 and 10000),
  unique (rule_set_id, priority)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  patient_id uuid references public.patients (id),
  encounter_id uuid references public.encounters (id),
  occupancy_contract_id uuid references public.occupancy_contracts (id),
  payer_kind public.payer_kind not null,
  issued_at timestamptz not null default now(),
  total_cents integer not null check (total_cents >= 0),
  split_rule_set_id uuid references public.split_rule_sets (id)
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  procedure_id uuid references public.procedures (id),
  description text not null,
  quantity numeric(12, 3) not null default 1,
  unit_cents integer not null,
  amount_cents integer not null
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id),
  method text not null,
  paid_at timestamptz not null default now(),
  amount_cents integer not null check (amount_cents > 0),
  external_txn_id text
);

create table public.payment_splits (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete restrict,
  split_rule_id uuid references public.split_rules (id),
  beneficiary_kind public.split_beneficiary_kind not null,
  beneficiary_practice_id uuid references public.practice_units (id),
  beneficiary_professional_id uuid references public.professionals (id),
  beneficiary_cost_center_id uuid references public.cost_centers (id),
  amount_cents integer not null,
  check (amount_cents >= 0)
);

create table public.cost_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  cost_center_id uuid not null references public.cost_centers (id),
  occupancy_contract_id uuid references public.occupancy_contracts (id),
  practice_id uuid references public.practice_units (id),
  competence date not null,
  description text not null,
  amount_cents integer not null,
  source_movement_id uuid
);

create index cost_allocations_competence_idx on public.cost_allocations (competence, practice_id);

-- ---------------------------------------------------------------------------
-- Estoque dual-class
-- ---------------------------------------------------------------------------

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  room_id uuid references public.rooms (id),
  code text not null,
  name text not null,
  handles_clinical boolean not null default false,
  handles_pantry boolean not null default false,
  unique (organization_id, code)
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  sku text not null,
  name text not null,
  item_class public.item_class not null,
  unit text not null default 'un',
  requires_lot boolean generated always as (item_class = 'clinical_lot_controlled') stored,
  min_qty numeric(12, 3) not null default 0,
  default_charge_target public.charge_target not null default 'none',
  unique (organization_id, sku)
);

create table public.item_lots (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id),
  warehouse_id uuid not null references public.warehouses (id),
  lot_code text not null,
  expires_on date,
  qty_on_hand numeric(12, 3) not null default 0 check (qty_on_hand >= 0),
  unique (item_id, warehouse_id, lot_code)
);

create index item_lots_fefo_idx on public.item_lots (item_id, warehouse_id, expires_on nulls last);

create table public.stock_balances (
  warehouse_id uuid not null references public.warehouses (id),
  item_id uuid not null references public.items (id),
  qty_on_hand numeric(12, 3) not null default 0 check (qty_on_hand >= 0),
  primary key (warehouse_id, item_id)
);

create table public.procedure_kits (
  id uuid primary key default gen_random_uuid(),
  procedure_id uuid not null references public.procedures (id),
  name text not null,
  bill_to_patient boolean not null default false,
  auto_consume boolean not null default true,
  unique (procedure_id, name)
);

create table public.procedure_kit_items (
  kit_id uuid not null references public.procedure_kits (id) on delete cascade,
  item_id uuid not null references public.items (id),
  qty numeric(12, 3) not null check (qty > 0),
  charge_target public.charge_target not null,
  primary key (kit_id, item_id)
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  warehouse_id uuid not null references public.warehouses (id),
  item_id uuid not null references public.items (id),
  lot_id uuid references public.item_lots (id),
  kind public.movement_kind not null,
  qty numeric(12, 3) not null check (qty <> 0),
  encounter_id uuid references public.encounters (id),
  practice_id uuid references public.practice_units (id),
  invoice_id uuid references public.invoices (id),
  occurred_at timestamptz not null default now(),
  created_by uuid not null references public.profiles (id),
  note text
);

create index stock_movements_item_time_idx on public.stock_movements (item_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Auditoria append-only
-- ---------------------------------------------------------------------------

create table public.audit_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid references public.profiles (id),
  action public.audit_action not null,
  entity_table text not null,
  entity_id uuid,
  practice_id uuid,
  patient_id uuid,
  metadata jsonb not null default '{}'::jsonb
);

revoke update, delete on public.audit_events from anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Helpers de RLS
-- ---------------------------------------------------------------------------

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles where id = auth.uid()
$$;

create or replace function public.has_practice_role(p_practice uuid, p_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_practice_roles r
    where r.user_id = auth.uid()
      and r.practice_id = p_practice
      and r.role = any (p_roles)
  )
$$;

create or replace function public.can_read_clinical(p_practice uuid, p_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_practice_roles r
    where r.user_id = auth.uid()
      and r.practice_id = p_practice
      and r.clinical_access in ('practice', 'own_encounters')
  )
  or exists (
    select 1
    from public.break_glass_grants g
    where g.user_id = auth.uid()
      and g.practice_id = p_practice
      and g.patient_id = p_patient
      and g.expires_at > now()
  )
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.practice_units enable row level security;
alter table public.rooms enable row level security;
alter table public.occupancy_contracts enable row level security;
alter table public.profiles enable row level security;
alter table public.user_practice_roles enable row level security;
alter table public.professionals enable row level security;
alter table public.patients enable row level security;
alter table public.patient_practice_links enable row level security;
alter table public.appointments enable row level security;
alter table public.encounters enable row level security;
alter table public.clinical_notes enable row level security;
alter table public.break_glass_grants enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.payment_splits enable row level security;
alter table public.items enable row level security;
alter table public.item_lots enable row level security;
alter table public.stock_movements enable row level security;
alter table public.audit_events enable row level security;

create policy practice_units_member on public.practice_units
  for select using (
    exists (
      select 1 from public.user_practice_roles r
      where r.user_id = auth.uid() and r.practice_id = id
    )
  );

create policy patients_reception_read on public.patients
  for select using (
    exists (
      select 1 from public.user_practice_roles r
      where r.user_id = auth.uid()
        and r.role in ('owner', 'admin', 'secretary', 'physician', 'finance')
    )
  );

create policy encounters_clinical_read on public.encounters
  for select using (public.can_read_clinical(practice_id, patient_id));

create policy clinical_notes_isolated on public.clinical_notes
  for select using (public.can_read_clinical(practice_id, (
    select e.patient_id from public.encounters e where e.id = encounter_id
  )));

create policy clinical_notes_no_secretary_write on public.clinical_notes
  for insert with check (
    public.has_practice_role(practice_id, array['physician', 'owner']::public.app_role[])
  );

create policy invoices_practice_scope on public.invoices
  for select using (
    public.has_practice_role(practice_id, array['owner', 'admin', 'secretary', 'finance', 'physician']::public.app_role[])
  );

create policy stock_movements_ops on public.stock_movements
  for select using (
    exists (
      select 1 from public.user_practice_roles r
      where r.user_id = auth.uid()
        and r.role in ('owner', 'admin', 'inventory', 'secretary')
    )
  );

create policy audit_events_admin_read on public.audit_events
  for select using (
    exists (
      select 1 from public.user_practice_roles r
      where r.user_id = auth.uid() and r.role in ('owner', 'admin')
    )
  );

-- Secretárias agendam qualquer sala; não leem clinical_notes (política acima).
create policy appointments_secretary_rw on public.appointments
  for all using (
    public.has_practice_role(practice_id, array['owner', 'admin', 'secretary', 'physician']::public.app_role[])
    or exists (
      select 1 from public.user_practice_roles r
      where r.user_id = auth.uid() and r.can_schedule_any_practice
    )
  )
  with check (
    public.has_practice_role(practice_id, array['owner', 'admin', 'secretary', 'physician']::public.app_role[])
    or exists (
      select 1 from public.user_practice_roles r
      where r.user_id = auth.uid() and r.can_schedule_any_practice
    )
  );

comment on table public.clinical_notes is
  'Prontuário isolado por practice_id. Secretária não possui clinical_access.';
comment on table public.stock_movements is
  'Livro razão do estoque. Nunca atualizar; estorne com movimento inverso.';
comment on table public.payment_splits is
  'Resultado materializado do motor de split; soma deve igualar payments.amount_cents.';
