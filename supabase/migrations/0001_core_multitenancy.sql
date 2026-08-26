-- Casa Florescer — núcleo (Supabase / PostgreSQL 15+)
-- Baseline de autorização:
--   1. Uma organização (Casa Florescer); práticas isolam prontuário (casa × locatário).
--   2. Staff RBAC vive em user_practice_roles (OWNER + DOCTOR coexistentes).
--   3. SYSTEM_ADMIN vive em system_admins — nunca em app_role, OWNER ou ADMIN.
--   4. PATIENT não é app_role (portal entra na 0003).
--   5. MPI da casa; prontuário da prática; estoque em um único livro (stock_movements).
--   6. audit_events é append-only.
--   7. permissions de UI entram na 0004 e nunca substituem RLS.

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.practice_kind as enum ('house', 'sublet');
create type public.room_status as enum ('active', 'maintenance', 'inactive');

-- DOCTOR funcional = physician técnico. Sem inventory, finance, patient, system_admin.
create type public.app_role as enum (
  'owner',
  'admin',
  'physician',
  'secretary'
);

create type public.clinical_access as enum (
  'none',
  'own_encounters',
  'practice',
  'break_glass'
);

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
  'export',
  'grant',
  'revoke'
);

-- ---------------------------------------------------------------------------
-- Organização, práticas e salas (classificação das 4 salas: 0005; sem seed)
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
  unique (organization_id, code),
  unique (id, organization_id)
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  code text not null,
  name text not null,
  is_house boolean not null default false,
  status public.room_status not null default 'active',
  unique (organization_id, code),
  unique (id, organization_id)
);

comment on column public.rooms.is_house is
  'Marcador legado. A classificação física (house/sublet/operacional) entra na 0005 via room_kind; não semear as 4 salas aqui.';

-- ---------------------------------------------------------------------------
-- Identidade de staff (sem profiles.role)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  organization_id uuid not null references public.organizations (id),
  full_name text not null,
  email citext not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'Staff autenticado. Papéis em user_practice_roles. SYSTEM_ADMIN em system_admins. Paciente não usa esta tabela como RBAC.';

create table public.system_admins (
  user_id uuid primary key references public.profiles (id) on delete restrict,
  granted_by uuid references public.profiles (id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  reason text not null,
  check (char_length(trim(reason)) >= 3),
  check (revoked_at is null or revoked_at >= granted_at)
);

comment on table public.system_admins is
  'Administrador técnico da plataforma. OWNER/ADMIN não concedem nem revogam. Bootstrap inicial via service_role/dashboard.';

create table public.user_practice_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  practice_id uuid not null references public.practice_units (id) on delete cascade,
  role public.app_role not null,
  clinical_access public.clinical_access not null default 'none',
  can_cashier boolean not null default false,
  can_schedule_any_practice boolean not null default false,
  can_manage_stock boolean not null default false,
  unique (user_id, practice_id, role)
);

create index user_practice_roles_user_idx on public.user_practice_roles (user_id);
create index user_practice_roles_practice_idx on public.user_practice_roles (practice_id);

comment on table public.user_practice_roles is
  'Papéis de staff por prática. UNIQUE (user, practice, role) permite OWNER + physician (DOCTOR) na mesma prática.';
comment on column public.user_practice_roles.clinical_access is
  'Teto de leitura clínica derivado do papel. Nunca amplia além do que physician permite. break_glass não se concede nesta coluna.';
comment on column public.user_practice_roles.can_manage_stock is
  'Substitui o antigo papel inventory. Default false; OWNER/ADMIN da casa operam estoque pelas políticas de papel.';
comment on column public.user_practice_roles.can_schedule_any_practice is
  'Agenda de qualquer prática da MESMA organização (recepção da casa). Não atravessa org.';

create table public.professionals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id),
  practice_id uuid not null references public.practice_units (id),
  organization_id uuid not null references public.organizations (id),
  council_type text not null,
  council_number text not null,
  unique (practice_id, council_type, council_number),
  unique (id, practice_id),
  unique (id, organization_id)
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
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (organization_id, cpf),
  unique (id, organization_id)
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
  organization_id uuid not null references public.organizations (id),
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
  organization_id uuid not null references public.organizations (id),
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
  organization_id uuid not null references public.organizations (id),
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
  approved_by uuid not null references public.profiles (id),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (char_length(trim(reason)) >= 3),
  check (expires_at >= starts_at)
);

create index break_glass_active_idx
  on public.break_glass_grants (user_id, patient_id, practice_id, expires_at);

comment on table public.break_glass_grants is
  'Acesso clínico excepcional. Não altera user_practice_roles. Concedido por SYSTEM_ADMIN ou OWNER. Auditado.';

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
  received_by uuid references public.profiles (id),
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
  practice_id uuid references public.practice_units (id),
  competence date not null,
  description text not null,
  amount_cents integer not null,
  source_movement_id uuid
);

create index cost_allocations_competence_idx on public.cost_allocations (competence, practice_id);

-- ---------------------------------------------------------------------------
-- Estoque (livro único: stock_movements)
-- ---------------------------------------------------------------------------

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  room_id uuid references public.rooms (id),
  code text not null,
  name text not null,
  handles_clinical boolean not null default false,
  handles_pantry boolean not null default false,
  unique (organization_id, code),
  unique (id, organization_id)
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
  unique (organization_id, sku),
  unique (id, organization_id)
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
  destination_room_id uuid references public.rooms (id),
  occurred_at timestamptz not null default now(),
  created_by uuid not null references public.profiles (id),
  note text
);

create index stock_movements_item_time_idx on public.stock_movements (item_id, occurred_at desc);

comment on table public.stock_movements is
  'Único livro-razão de estoque. Nunca atualizar; estorne com movimento inverso. destination_room_id localiza o setor/sala.';

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

revoke insert, update, delete on public.audit_events from anon, authenticated;
revoke update, delete on public.audit_events from service_role;

comment on table public.audit_events is
  'Trilha append-only. MVP: break-glass, RBAC, SYSTEM_ADMIN, assinaturas, alterações críticas, exports, ops sensíveis. Leitura ordinária de prontuário fica para evolução futura.';

-- ---------------------------------------------------------------------------
-- Helpers de autorização
-- ---------------------------------------------------------------------------

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active
$$;

create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.organization_id
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active
$$;

create or replace function public.is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.system_admins s
    where s.user_id = auth.uid()
      and s.revoked_at is null
  )
$$;

comment on function public.is_system_admin() is
  'SYSTEM_ADMIN ativo em system_admins. Nunca deriva de OWNER, ADMIN ou profiles.role.';

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
    join public.profiles p on p.id = r.user_id
    where r.user_id = auth.uid()
      and p.is_active
      and r.practice_id = p_practice
      and r.role = any (p_roles)
  )
$$;

create or replace function public.has_org_staff_role(p_org uuid, p_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_practice_roles r
    join public.practice_units pu on pu.id = r.practice_id
    join public.profiles p on p.id = r.user_id
    where r.user_id = auth.uid()
      and p.is_active
      and pu.organization_id = p_org
      and r.role = any (p_roles)
  )
$$;

comment on function public.has_org_staff_role(uuid, public.app_role[]) is
  'Papel em QUALQUER prática da org (inclui locatário). Preferir is_house_staff para operação da casa.';

create or replace function public.is_house_staff(p_org uuid, p_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_practice_roles r
    join public.practice_units pu on pu.id = r.practice_id
    join public.profiles p on p.id = r.user_id
    where r.user_id = auth.uid()
      and p.is_active
      and pu.organization_id = p_org
      and pu.kind = 'house'
      and r.role = any (p_roles)
  )
$$;

create or replace function public.is_staff_of_org(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active
      and p.organization_id = p_org
  )
  and exists (
    select 1
    from public.user_practice_roles r
    where r.user_id = auth.uid()
  )
$$;

create or replace function public.has_active_break_glass(p_practice uuid, p_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.break_glass_grants g
    where g.user_id = auth.uid()
      and g.practice_id = p_practice
      and g.patient_id = p_patient
      and g.starts_at <= now()
      and g.expires_at > now()
  )
$$;

create or replace function public.can_read_clinical(
  p_practice uuid,
  p_patient uuid,
  p_professional uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_active_break_glass(p_practice, p_patient)
  or exists (
    select 1
    from public.user_practice_roles r
    join public.profiles p on p.id = r.user_id
    where r.user_id = auth.uid()
      and p.is_active
      and r.practice_id = p_practice
      and r.role = 'physician'
      and r.clinical_access = 'practice'
  )
  or (
    p_professional is not null
    and exists (
      select 1
      from public.user_practice_roles r
      join public.profiles p on p.id = r.user_id
      join public.professionals pr on pr.profile_id = r.user_id
        and pr.practice_id = r.practice_id
      where r.user_id = auth.uid()
        and p.is_active
        and r.practice_id = p_practice
        and r.role = 'physician'
        and r.clinical_access = 'own_encounters'
        and pr.id = p_professional
    )
  )
$$;

create or replace function public.can_write_clinical(p_practice uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_practice_role(p_practice, array['physician']::public.app_role[])
$$;

create or replace function public.is_house_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_house_staff(
    p_org,
    array['owner', 'admin', 'secretary', 'physician']::public.app_role[]
  )
$$;

create or replace function public.can_access_stock(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_house_staff(p_org, array['owner', 'admin']::public.app_role[])
  or exists (
    select 1
    from public.user_practice_roles r
    join public.practice_units pu on pu.id = r.practice_id
    join public.profiles p on p.id = r.user_id
    where r.user_id = auth.uid()
      and p.is_active
      and pu.organization_id = p_org
      and pu.kind = 'house'
      and r.can_manage_stock
  )
$$;

create or replace function public.can_schedule_in_org(p_org uuid, p_practice uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_practice_role(
    p_practice,
    array['owner', 'admin', 'secretary', 'physician']::public.app_role[]
  )
  or exists (
    select 1
    from public.user_practice_roles r
    join public.practice_units pu on pu.id = r.practice_id
    join public.profiles p on p.id = r.user_id
    where r.user_id = auth.uid()
      and p.is_active
      and r.can_schedule_any_practice
      and pu.organization_id = p_org
  )
$$;

-- ---------------------------------------------------------------------------
-- Auditoria (funções definer; authenticated não tem INSERT direto)
-- ---------------------------------------------------------------------------

create or replace function public.write_audit(
  p_action public.audit_action,
  p_entity_table text,
  p_entity_id uuid default null,
  p_practice uuid default null,
  p_patient uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_events (
    actor_id, action, entity_table, entity_id, practice_id, patient_id, metadata
  ) values (
    auth.uid(), p_action, p_entity_table, p_entity_id, p_practice, p_patient, coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- SYSTEM_ADMIN: concessão apenas por SYSTEM_ADMIN já ativo (não OWNER/ADMIN)
-- ---------------------------------------------------------------------------

create or replace function public.grant_system_admin(p_user_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_reason is null or char_length(trim(p_reason)) < 3 then
    raise exception 'Motivo obrigatório para conceder SYSTEM_ADMIN.';
  end if;
  if not public.is_system_admin() then
    raise exception 'Somente SYSTEM_ADMIN pode conceder SYSTEM_ADMIN.';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Perfil de staff inexistente.';
  end if;
  if exists (
    select 1 from public.system_admins s
    where s.user_id = p_user_id and s.revoked_at is null
  ) then
    raise exception 'Usuário já é SYSTEM_ADMIN.';
  end if;

  insert into public.system_admins (user_id, granted_by, reason)
  values (p_user_id, auth.uid(), trim(p_reason))
  on conflict (user_id) do update
    set granted_by = excluded.granted_by,
        granted_at = now(),
        revoked_at = null,
        reason = excluded.reason
  where public.system_admins.revoked_at is not null;

  perform public.write_audit(
    'grant',
    'system_admins',
    p_user_id,
    null,
    null,
    jsonb_build_object('reason', trim(p_reason))
  );

  return p_user_id;
end;
$$;

create or replace function public.revoke_system_admin(p_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_reason is null or char_length(trim(p_reason)) < 3 then
    raise exception 'Motivo obrigatório para revogar SYSTEM_ADMIN.';
  end if;
  if not public.is_system_admin() then
    raise exception 'Somente SYSTEM_ADMIN pode revogar SYSTEM_ADMIN.';
  end if;

  update public.system_admins
  set revoked_at = now(),
      reason = trim(p_reason)
  where user_id = p_user_id
    and revoked_at is null;

  if not found then
    raise exception 'SYSTEM_ADMIN ativo não encontrado.';
  end if;

  perform public.write_audit(
    'revoke',
    'system_admins',
    p_user_id,
    null,
    null,
    jsonb_build_object('reason', trim(p_reason))
  );
end;
$$;

create or replace function public.grant_break_glass(
  p_user_id uuid,
  p_patient_id uuid,
  p_practice_id uuid,
  p_reason text,
  p_starts_at timestamptz,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_id uuid;
begin
  if p_reason is null or char_length(trim(p_reason)) < 3 then
    raise exception 'Motivo obrigatório para break-glass.';
  end if;
  if p_expires_at <= coalesce(p_starts_at, now()) then
    raise exception 'Término do break-glass deve ser posterior ao início.';
  end if;

  select organization_id into v_org
  from public.practice_units
  where id = p_practice_id;

  if v_org is null then
    raise exception 'Prática inexistente.';
  end if;

  if not (
    public.is_system_admin()
    or public.is_house_staff(v_org, array['owner']::public.app_role[])
  ) then
    raise exception 'Somente SYSTEM_ADMIN ou OWNER podem conceder break-glass.';
  end if;

  insert into public.break_glass_grants (
    user_id, patient_id, practice_id, reason, approved_by, starts_at, expires_at
  ) values (
    p_user_id,
    p_patient_id,
    p_practice_id,
    trim(p_reason),
    auth.uid(),
    coalesce(p_starts_at, now()),
    p_expires_at
  )
  returning id into v_id;

  perform public.write_audit(
    'break_glass',
    'break_glass_grants',
    v_id,
    p_practice_id,
    p_patient_id,
    jsonb_build_object(
      'grantee', p_user_id,
      'reason', trim(p_reason),
      'starts_at', coalesce(p_starts_at, now()),
      'expires_at', p_expires_at
    )
  );

  return v_id;
end;
$$;

create or replace function public.revoke_break_glass(p_grant_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.break_glass_grants%rowtype;
  v_org uuid;
  v_new_expires timestamptz;
begin
  if p_reason is null or char_length(trim(p_reason)) < 3 then
    raise exception 'Motivo obrigatório para revogar break-glass.';
  end if;

  select * into v_row
  from public.break_glass_grants
  where id = p_grant_id;

  if v_row.id is null then
    raise exception 'Grant de break-glass inexistente.';
  end if;

  select organization_id into v_org
  from public.practice_units
  where id = v_row.practice_id;

  if not (
    public.is_system_admin()
    or public.is_house_staff(v_org, array['owner']::public.app_role[])
  ) then
    raise exception 'Somente SYSTEM_ADMIN ou OWNER da casa podem revogar break-glass.';
  end if;

  if v_row.expires_at <= now() then
    raise exception 'Grant de break-glass já expirado.';
  end if;

  -- Antecipa expires_at sem apagar o histórico. Grant futuro nunca chega a vigorar.
  if v_row.starts_at > now() then
    v_new_expires := v_row.starts_at;
  else
    v_new_expires := now();
  end if;

  update public.break_glass_grants
  set expires_at = v_new_expires
  where id = p_grant_id
    and expires_at > now();

  perform public.write_audit(
    'revoke',
    'break_glass_grants',
    p_grant_id,
    v_row.practice_id,
    v_row.patient_id,
    jsonb_build_object(
      'grantee', v_row.user_id,
      'reason', trim(p_reason),
      'expires_at', v_new_expires
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers de coerência e de auditoria de RBAC
-- ---------------------------------------------------------------------------

-- Deriva organization_id da prática e só então devolve o valor validado.
-- Usar no INÍCIO de qualquer BEFORE write — não depende de ordem alfabética de triggers.
create or replace function public.resolve_org_from_practice(p_practice uuid, p_org uuid)
returns uuid
language plpgsql
stable
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org
  from public.practice_units
  where id = p_practice;

  if v_org is null then
    raise exception 'Prática inexistente.';
  end if;

  if p_org is null then
    return v_org;
  end if;

  if p_org is distinct from v_org then
    raise exception 'organization_id não coincide com a prática.';
  end if;

  return v_org;
end;
$$;

create or replace function public.sync_org_from_practice()
returns trigger
language plpgsql
as $$
begin
  new.organization_id := public.resolve_org_from_practice(new.practice_id, new.organization_id);
  return new;
end;
$$;

create or replace function public.user_practice_roles_before_write()
returns trigger
language plpgsql
as $$
declare
  v_kind public.practice_kind;
begin
  select kind into v_kind
  from public.practice_units
  where id = new.practice_id;

  if new.role is distinct from 'physician' then
    new.clinical_access := 'none';
  else
    if new.clinical_access = 'break_glass' then
      raise exception 'break_glass não se concede em user_practice_roles.';
    end if;
    if v_kind = 'house' then
      if new.clinical_access = 'none' then
        new.clinical_access := 'practice';
      end if;
    else
      if new.clinical_access = 'practice' then
        raise exception 'Locatário não pode receber clinical_access = practice.';
      end if;
      if new.clinical_access = 'none' then
        new.clinical_access := 'own_encounters';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.user_practice_roles_after_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit(
      'insert',
      'user_practice_roles',
      new.id,
      new.practice_id,
      null,
      jsonb_build_object('user_id', new.user_id, 'role', new.role)
    );
  elsif tg_op = 'UPDATE' then
    perform public.write_audit(
      'update',
      'user_practice_roles',
      new.id,
      new.practice_id,
      null,
      jsonb_build_object('user_id', new.user_id, 'role', new.role)
    );
  elsif tg_op = 'DELETE' then
    perform public.write_audit(
      'delete',
      'user_practice_roles',
      old.id,
      old.practice_id,
      null,
      jsonb_build_object('user_id', old.user_id, 'role', old.role)
    );
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.appointments_before_write()
returns trigger
language plpgsql
as $$
declare
  v_room_org uuid;
  v_patient_org uuid;
  v_prof_practice uuid;
  v_proc_org uuid;
  v_proc_practice uuid;
  v_proc_shared boolean;
begin
  new.organization_id := public.resolve_org_from_practice(new.practice_id, new.organization_id);

  select organization_id into v_room_org
  from public.rooms where id = new.room_id;

  select organization_id into v_patient_org
  from public.patients where id = new.patient_id;

  select practice_id into v_prof_practice
  from public.professionals where id = new.professional_id;

  if v_room_org is distinct from new.organization_id then
    raise exception 'Agenda: sala de outra organização.';
  end if;
  if v_patient_org is distinct from new.organization_id then
    raise exception 'Agenda: paciente de outra organização.';
  end if;
  if v_prof_practice is distinct from new.practice_id then
    raise exception 'Agenda: profissional não pertence à prática.';
  end if;

  if new.procedure_id is not null then
    select organization_id, practice_id, is_shared
    into v_proc_org, v_proc_practice, v_proc_shared
    from public.procedures where id = new.procedure_id;

    if v_proc_org is distinct from new.organization_id then
      raise exception 'Agenda: procedimento de outra organização.';
    end if;
    if not v_proc_shared and v_proc_practice is distinct from new.practice_id then
      raise exception 'Agenda: procedimento de outra prática.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.encounters_before_write()
returns trigger
language plpgsql
as $$
declare
  v_patient_org uuid;
  v_prof_practice uuid;
  v_appt public.appointments%rowtype;
begin
  new.organization_id := public.resolve_org_from_practice(new.practice_id, new.organization_id);

  select organization_id into v_patient_org
  from public.patients where id = new.patient_id;

  select practice_id into v_prof_practice
  from public.professionals where id = new.professional_id;

  if v_patient_org is distinct from new.organization_id then
    raise exception 'Encounter: paciente de outra organização.';
  end if;
  if v_prof_practice is distinct from new.practice_id then
    raise exception 'Encounter: profissional não pertence à prática.';
  end if;

  if new.appointment_id is not null then
    select * into v_appt from public.appointments where id = new.appointment_id;
    if v_appt.practice_id is distinct from new.practice_id
       or v_appt.patient_id is distinct from new.patient_id
       or v_appt.professional_id is distinct from new.professional_id then
      raise exception 'Encounter: divergência em relação ao agendamento.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.clinical_notes_before_write()
returns trigger
language plpgsql
as $$
declare
  v_enc public.encounters%rowtype;
begin
  select * into v_enc from public.encounters where id = new.encounter_id;
  if v_enc.id is null then
    raise exception 'Nota clínica sem encounter.';
  end if;
  if new.practice_id is null then
    new.practice_id := v_enc.practice_id;
  end if;
  new.organization_id := public.resolve_org_from_practice(new.practice_id, new.organization_id);
  if new.practice_id is distinct from v_enc.practice_id
     or new.organization_id is distinct from v_enc.organization_id then
    raise exception 'Nota clínica fora do escopo do encounter.';
  end if;
  return new;
end;
$$;

create or replace function public.stock_movements_before_write()
returns trigger
language plpgsql
as $$
declare
  v_wh_org uuid;
  v_item_org uuid;
  v_room_org uuid;
  v_lot_item uuid;
  v_lot_wh uuid;
  v_lot_item_org uuid;
begin
  if new.practice_id is not null then
    new.organization_id := public.resolve_org_from_practice(new.practice_id, new.organization_id);
  end if;

  select organization_id into v_wh_org from public.warehouses where id = new.warehouse_id;
  select organization_id into v_item_org from public.items where id = new.item_id;

  if v_wh_org is null then
    raise exception 'Depósito inexistente.';
  end if;
  if v_item_org is null then
    raise exception 'Item inexistente.';
  end if;

  if new.organization_id is null then
    new.organization_id := v_wh_org;
  end if;

  if v_wh_org is distinct from new.organization_id
     or v_item_org is distinct from new.organization_id
     or v_wh_org is distinct from v_item_org then
    raise exception 'Movimento de estoque cruza organizações, depósitos ou itens.';
  end if;

  if new.destination_room_id is not null then
    select organization_id into v_room_org from public.rooms where id = new.destination_room_id;
    if v_room_org is distinct from new.organization_id then
      raise exception 'Sala de destino de outra organização.';
    end if;
  end if;

  if new.lot_id is not null then
    select item_id, warehouse_id into v_lot_item, v_lot_wh
    from public.item_lots
    where id = new.lot_id;

    if v_lot_item is null then
      raise exception 'Lote inexistente.';
    end if;
    if v_lot_item is distinct from new.item_id then
      raise exception 'Lote não pertence ao item do movimento.';
    end if;
    if v_lot_wh is distinct from new.warehouse_id then
      raise exception 'Lote não pertence ao depósito do movimento.';
    end if;

    select organization_id into v_lot_item_org from public.items where id = v_lot_item;
    if v_lot_item_org is distinct from new.organization_id then
      raise exception 'Lote de outra organização.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.encounters_after_sign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'signed'
     and (old.status is distinct from 'signed' or old.signed_at is distinct from new.signed_at) then
    perform public.write_audit(
      'sign',
      'encounters',
      new.id,
      new.practice_id,
      new.patient_id,
      jsonb_build_object('signed_by', new.signed_by)
    );
  end if;
  return new;
end;
$$;

create or replace function public.break_glass_before_write()
returns trigger
language plpgsql
as $$
begin
  if new.approved_by is null then
    new.approved_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists professionals_sync_org on public.professionals;
create trigger professionals_sync_org
  before insert or update of practice_id, organization_id
  on public.professionals
  for each row execute function public.sync_org_from_practice();

drop trigger if exists consents_sync_org on public.consents;
create trigger consents_sync_org
  before insert or update of practice_id, organization_id
  on public.consents
  for each row execute function public.sync_org_from_practice();

drop trigger if exists user_practice_roles_before_write on public.user_practice_roles;
create trigger user_practice_roles_before_write
  before insert or update
  on public.user_practice_roles
  for each row execute function public.user_practice_roles_before_write();

drop trigger if exists user_practice_roles_after_write on public.user_practice_roles;
create trigger user_practice_roles_after_write
  after insert or update or delete
  on public.user_practice_roles
  for each row execute function public.user_practice_roles_after_write();

drop trigger if exists appointments_scope_check on public.appointments;
drop trigger if exists appointments_before_write on public.appointments;
create trigger appointments_before_write
  before insert or update
  on public.appointments
  for each row execute function public.appointments_before_write();

drop trigger if exists encounters_scope_check on public.encounters;
drop trigger if exists encounters_before_write on public.encounters;
create trigger encounters_before_write
  before insert or update
  on public.encounters
  for each row execute function public.encounters_before_write();

drop trigger if exists encounters_after_sign on public.encounters;
create trigger encounters_after_sign
  after update
  on public.encounters
  for each row execute function public.encounters_after_sign();

drop trigger if exists clinical_notes_scope_check on public.clinical_notes;
drop trigger if exists clinical_notes_before_write on public.clinical_notes;
create trigger clinical_notes_before_write
  before insert or update
  on public.clinical_notes
  for each row execute function public.clinical_notes_before_write();

drop trigger if exists stock_movements_scope_check on public.stock_movements;
drop trigger if exists stock_movements_before_write on public.stock_movements;
create trigger stock_movements_before_write
  before insert or update
  on public.stock_movements
  for each row execute function public.stock_movements_before_write();

drop trigger if exists break_glass_before_write on public.break_glass_grants;
create trigger break_glass_before_write
  before insert
  on public.break_glass_grants
  for each row execute function public.break_glass_before_write();

-- ---------------------------------------------------------------------------
-- Grants das funções
-- ---------------------------------------------------------------------------

revoke all on function public.current_profile_id() from public;
revoke all on function public.current_org_id() from public;
revoke all on function public.is_system_admin() from public;
revoke all on function public.has_practice_role(uuid, public.app_role[]) from public;
revoke all on function public.has_org_staff_role(uuid, public.app_role[]) from public;
revoke all on function public.is_house_staff(uuid, public.app_role[]) from public;
revoke all on function public.is_staff_of_org(uuid) from public;
revoke all on function public.is_house_member(uuid) from public;
revoke all on function public.has_active_break_glass(uuid, uuid) from public;
revoke all on function public.can_read_clinical(uuid, uuid, uuid) from public;
revoke all on function public.can_write_clinical(uuid) from public;
revoke all on function public.can_access_stock(uuid) from public;
revoke all on function public.can_schedule_in_org(uuid, uuid) from public;
revoke all on function public.write_audit(public.audit_action, text, uuid, uuid, uuid, jsonb) from public;
revoke all on function public.grant_system_admin(uuid, text) from public;
revoke all on function public.revoke_system_admin(uuid, text) from public;
revoke all on function public.grant_break_glass(uuid, uuid, uuid, text, timestamptz, timestamptz) from public;
revoke all on function public.revoke_break_glass(uuid, text) from public;

grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.current_org_id() to authenticated;
grant execute on function public.is_system_admin() to authenticated;
grant execute on function public.has_practice_role(uuid, public.app_role[]) to authenticated;
grant execute on function public.has_org_staff_role(uuid, public.app_role[]) to authenticated;
grant execute on function public.is_house_staff(uuid, public.app_role[]) to authenticated;
grant execute on function public.is_staff_of_org(uuid) to authenticated;
grant execute on function public.is_house_member(uuid) to authenticated;
grant execute on function public.has_active_break_glass(uuid, uuid) to authenticated;
grant execute on function public.can_read_clinical(uuid, uuid, uuid) to authenticated;
grant execute on function public.can_write_clinical(uuid) to authenticated;
grant execute on function public.can_access_stock(uuid) to authenticated;
grant execute on function public.can_schedule_in_org(uuid, uuid) to authenticated;
grant execute on function public.grant_system_admin(uuid, text) to authenticated;
grant execute on function public.revoke_system_admin(uuid, text) to authenticated;
grant execute on function public.grant_break_glass(uuid, uuid, uuid, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.revoke_break_glass(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS — políticas de papel/escopo (SYSTEM_ADMIN operacional entra na 0007)
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.practice_units enable row level security;
alter table public.rooms enable row level security;
alter table public.profiles enable row level security;
alter table public.system_admins enable row level security;
alter table public.user_practice_roles enable row level security;
alter table public.professionals enable row level security;
alter table public.patients enable row level security;
alter table public.patient_practice_links enable row level security;
alter table public.consents enable row level security;
alter table public.procedures enable row level security;
alter table public.appointments enable row level security;
alter table public.encounters enable row level security;
alter table public.clinical_notes enable row level security;
alter table public.break_glass_grants enable row level security;
alter table public.cost_centers enable row level security;
alter table public.split_rule_sets enable row level security;
alter table public.split_rules enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.payment_splits enable row level security;
alter table public.cost_allocations enable row level security;
alter table public.warehouses enable row level security;
alter table public.items enable row level security;
alter table public.item_lots enable row level security;
alter table public.stock_balances enable row level security;
alter table public.procedure_kits enable row level security;
alter table public.procedure_kit_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.audit_events enable row level security;

-- system_admins: authenticated NÃO insere/altera direto. GRANT/REVOKE só via funções.
create policy system_admins_select_self_scope on public.system_admins
  for select using (public.is_system_admin());

create policy organizations_staff_select on public.organizations
  for select using (public.current_org_id() = id);

create policy practice_units_select on public.practice_units
  for select using (
    public.has_practice_role(id, array['owner', 'admin', 'secretary', 'physician']::public.app_role[])
    or public.is_house_staff(organization_id, array['owner', 'admin', 'secretary']::public.app_role[])
  );

create policy practice_units_write_house on public.practice_units
  for all using (
    public.is_house_staff(organization_id, array['owner']::public.app_role[])
  )
  with check (
    public.is_house_staff(organization_id, array['owner']::public.app_role[])
  );

create policy rooms_select_house on public.rooms
  for select using (public.is_house_member(organization_id));

create policy rooms_write_house on public.rooms
  for insert with check (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  );

create policy rooms_update_house on public.rooms
  for update using (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  )
  with check (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  );

create policy profiles_self_select on public.profiles
  for select using (id = auth.uid());

create policy profiles_org_staff_select on public.profiles
  for select using (public.is_house_member(organization_id));

create policy profiles_self_update on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid() and organization_id = (select organization_id from public.profiles p where p.id = auth.uid()));

create policy profiles_house_update on public.profiles
  for update using (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  )
  with check (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  );

create policy profiles_house_insert on public.profiles
  for insert with check (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  );

create policy user_practice_roles_select on public.user_practice_roles
  for select using (
    user_id = auth.uid()
    or public.is_house_staff(
      (select pu.organization_id from public.practice_units pu where pu.id = practice_id),
      array['owner', 'admin']::public.app_role[]
    )
  );

create policy user_practice_roles_house_write on public.user_practice_roles
  for insert with check (
    public.is_house_staff(
      (select pu.organization_id from public.practice_units pu where pu.id = practice_id),
      array['owner', 'admin']::public.app_role[]
    )
    and (
      role <> 'owner'
      or public.is_house_staff(
        (select pu.organization_id from public.practice_units pu where pu.id = practice_id),
        array['owner']::public.app_role[]
      )
    )
  );

create policy user_practice_roles_house_update on public.user_practice_roles
  for update using (
    public.is_house_staff(
      (select pu.organization_id from public.practice_units pu where pu.id = practice_id),
      array['owner', 'admin']::public.app_role[]
    )
  )
  with check (
    public.is_house_staff(
      (select pu.organization_id from public.practice_units pu where pu.id = practice_id),
      array['owner', 'admin']::public.app_role[]
    )
    and (
      role <> 'owner'
      or public.is_house_staff(
        (select pu.organization_id from public.practice_units pu where pu.id = practice_id),
        array['owner']::public.app_role[]
      )
    )
  );

create policy user_practice_roles_house_delete on public.user_practice_roles
  for delete using (
    public.is_house_staff(
      (select pu.organization_id from public.practice_units pu where pu.id = practice_id),
      array['owner', 'admin']::public.app_role[]
    )
    and (
      role <> 'owner'
      or public.is_house_staff(
        (select pu.organization_id from public.practice_units pu where pu.id = practice_id),
        array['owner']::public.app_role[]
      )
    )
  );

create policy professionals_select on public.professionals
  for select using (
    public.is_house_member(organization_id)
    or public.has_practice_role(practice_id, array['owner', 'admin', 'secretary', 'physician']::public.app_role[])
    or profile_id = auth.uid()
  );

create policy professionals_house_write on public.professionals
  for all using (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  )
  with check (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  );

create policy patients_house_select on public.patients
  for select using (
    public.is_house_staff(organization_id, array['owner', 'admin', 'secretary', 'physician']::public.app_role[])
  );

create policy patients_linked_physician_select on public.patients
  for select using (
    exists (
      select 1
      from public.patient_practice_links l
      where l.patient_id = patients.id
        and public.has_practice_role(l.practice_id, array['physician']::public.app_role[])
    )
    or created_by = auth.uid()
  );

create policy patients_staff_insert on public.patients
  for insert with check (
    public.is_house_staff(organization_id, array['owner', 'admin', 'secretary', 'physician']::public.app_role[])
    or public.has_org_staff_role(organization_id, array['physician']::public.app_role[])
  );

create policy patients_staff_update on public.patients
  for update using (
    public.is_house_staff(organization_id, array['owner', 'admin', 'secretary', 'physician']::public.app_role[])
    or exists (
      select 1
      from public.patient_practice_links l
      where l.patient_id = patients.id
        and public.has_practice_role(l.practice_id, array['physician']::public.app_role[])
    )
  )
  with check (
    public.is_house_staff(organization_id, array['owner', 'admin', 'secretary', 'physician']::public.app_role[])
    or exists (
      select 1
      from public.patient_practice_links l
      where l.patient_id = patients.id
        and public.has_practice_role(l.practice_id, array['physician']::public.app_role[])
    )
  );

create policy patient_links_select on public.patient_practice_links
  for select using (
    public.has_practice_role(practice_id, array['owner', 'admin', 'secretary', 'physician']::public.app_role[])
    or public.is_house_staff(
      (select pu.organization_id from public.practice_units pu where pu.id = practice_id),
      array['owner', 'admin', 'secretary']::public.app_role[]
    )
  );

create policy patient_links_write on public.patient_practice_links
  for insert with check (
    public.has_practice_role(practice_id, array['owner', 'admin', 'secretary', 'physician']::public.app_role[])
    or public.is_house_staff(
      (select pu.organization_id from public.practice_units pu where pu.id = practice_id),
      array['owner', 'admin', 'secretary']::public.app_role[]
    )
  );

create policy consents_practice on public.consents
  for all using (
    public.has_practice_role(practice_id, array['owner', 'admin', 'secretary', 'physician']::public.app_role[])
  )
  with check (
    public.has_practice_role(practice_id, array['owner', 'admin', 'secretary', 'physician']::public.app_role[])
  );

create policy procedures_select on public.procedures
  for select using (
    public.is_house_member(organization_id)
    or (
      practice_id is not null
      and public.has_practice_role(practice_id, array['owner', 'admin', 'secretary', 'physician']::public.app_role[])
    )
  );

create policy procedures_write on public.procedures
  for all using (
    public.is_house_staff(organization_id, array['owner', 'admin', 'physician']::public.app_role[])
  )
  with check (
    public.is_house_staff(organization_id, array['owner', 'admin', 'physician']::public.app_role[])
  );

create policy appointments_staff on public.appointments
  for all using (public.can_schedule_in_org(organization_id, practice_id))
  with check (public.can_schedule_in_org(organization_id, practice_id));

create policy encounters_clinical_select on public.encounters
  for select using (public.can_read_clinical(practice_id, patient_id, professional_id));

create policy encounters_clinical_insert on public.encounters
  for insert with check (
    public.can_write_clinical(practice_id)
    and exists (
      select 1 from public.professionals pr
      where pr.id = professional_id
        and pr.profile_id = auth.uid()
        and pr.practice_id = practice_id
    )
  );

create policy encounters_clinical_update on public.encounters
  for update using (public.can_write_clinical(practice_id))
  with check (public.can_write_clinical(practice_id));

create policy clinical_notes_select on public.clinical_notes
  for select using (
    public.can_read_clinical(
      practice_id,
      (select e.patient_id from public.encounters e where e.id = encounter_id),
      (select e.professional_id from public.encounters e where e.id = encounter_id)
    )
  );

create policy clinical_notes_insert on public.clinical_notes
  for insert with check (
    public.can_write_clinical(practice_id)
    and created_by = auth.uid()
  );

create policy break_glass_select on public.break_glass_grants
  for select using (
    user_id = auth.uid()
    or public.is_house_staff(
      (select pu.organization_id from public.practice_units pu where pu.id = practice_id),
      array['owner']::public.app_role[]
    )
  );

-- INSERT direto bloqueado: usar grant_break_glass().
-- (sem policy de insert para authenticated)

create policy cost_centers_house on public.cost_centers
  for all using (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  )
  with check (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  );

create policy split_rule_sets_house on public.split_rule_sets
  for all using (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  )
  with check (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  );

create policy split_rules_house on public.split_rules
  for all using (
    exists (
      select 1 from public.split_rule_sets s
      where s.id = rule_set_id
        and public.is_house_staff(s.organization_id, array['owner', 'admin']::public.app_role[])
    )
  )
  with check (
    exists (
      select 1 from public.split_rule_sets s
      where s.id = rule_set_id
        and public.is_house_staff(s.organization_id, array['owner', 'admin']::public.app_role[])
    )
  );

create policy invoices_select on public.invoices
  for select using (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
    or (
      public.has_practice_role(practice_id, array['secretary']::public.app_role[])
    )
    or exists (
      select 1 from public.user_practice_roles r
      where r.user_id = auth.uid()
        and r.practice_id = invoices.practice_id
        and r.can_cashier
    )
  );

create policy invoices_write on public.invoices
  for insert with check (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
    or exists (
      select 1 from public.user_practice_roles r
      where r.user_id = auth.uid()
        and r.practice_id = invoices.practice_id
        and r.can_cashier
    )
  );

create policy invoice_items_via_invoice on public.invoice_items
  for all using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_id
        and (
          public.is_house_staff(i.organization_id, array['owner', 'admin']::public.app_role[])
          or exists (
            select 1 from public.user_practice_roles r
            where r.user_id = auth.uid()
              and r.practice_id = i.practice_id
              and r.can_cashier
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_id
        and (
          public.is_house_staff(i.organization_id, array['owner', 'admin']::public.app_role[])
          or exists (
            select 1 from public.user_practice_roles r
            where r.user_id = auth.uid()
              and r.practice_id = i.practice_id
              and r.can_cashier
          )
        )
    )
  );

create policy payments_via_invoice on public.payments
  for all using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_id
        and (
          public.is_house_staff(i.organization_id, array['owner', 'admin']::public.app_role[])
          or exists (
            select 1 from public.user_practice_roles r
            where r.user_id = auth.uid()
              and r.practice_id = i.practice_id
              and r.can_cashier
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_id
        and (
          public.is_house_staff(i.organization_id, array['owner', 'admin']::public.app_role[])
          or exists (
            select 1 from public.user_practice_roles r
            where r.user_id = auth.uid()
              and r.practice_id = i.practice_id
              and r.can_cashier
          )
        )
    )
  );

create policy payment_splits_via_payment on public.payment_splits
  for select using (
    exists (
      select 1
      from public.payments pay
      join public.invoices i on i.id = pay.invoice_id
      where pay.id = payment_id
        and public.is_house_staff(i.organization_id, array['owner', 'admin']::public.app_role[])
    )
  );

create policy cost_allocations_house on public.cost_allocations
  for all using (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  )
  with check (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  );

create policy warehouses_stock on public.warehouses
  for all using (public.can_access_stock(organization_id))
  with check (public.can_access_stock(organization_id));

create policy items_stock on public.items
  for all using (public.can_access_stock(organization_id))
  with check (public.can_access_stock(organization_id));

create policy item_lots_stock on public.item_lots
  for all using (
    exists (
      select 1 from public.items i
      where i.id = item_id and public.can_access_stock(i.organization_id)
    )
  )
  with check (
    exists (
      select 1 from public.items i
      where i.id = item_id and public.can_access_stock(i.organization_id)
    )
  );

create policy stock_balances_stock on public.stock_balances
  for all using (
    exists (
      select 1 from public.warehouses w
      where w.id = warehouse_id and public.can_access_stock(w.organization_id)
    )
  )
  with check (
    exists (
      select 1 from public.warehouses w
      where w.id = warehouse_id and public.can_access_stock(w.organization_id)
    )
  );

create policy procedure_kits_select on public.procedure_kits
  for select using (
    exists (
      select 1 from public.procedures p
      where p.id = procedure_id
        and (
          public.is_house_member(p.organization_id)
          or (
            p.practice_id is not null
            and public.has_practice_role(
              p.practice_id,
              array['owner', 'admin', 'secretary', 'physician']::public.app_role[]
            )
          )
        )
    )
  );

create policy procedure_kits_write on public.procedure_kits
  for insert with check (
    exists (
      select 1 from public.procedures p
      where p.id = procedure_id
        and public.is_house_staff(p.organization_id, array['owner', 'admin', 'physician']::public.app_role[])
    )
  );

create policy procedure_kits_update on public.procedure_kits
  for update using (
    exists (
      select 1 from public.procedures p
      where p.id = procedure_id
        and public.is_house_staff(p.organization_id, array['owner', 'admin', 'physician']::public.app_role[])
    )
  )
  with check (
    exists (
      select 1 from public.procedures p
      where p.id = procedure_id
        and public.is_house_staff(p.organization_id, array['owner', 'admin', 'physician']::public.app_role[])
    )
  );

create policy procedure_kits_delete on public.procedure_kits
  for delete using (
    exists (
      select 1 from public.procedures p
      where p.id = procedure_id
        and public.is_house_staff(p.organization_id, array['owner', 'admin', 'physician']::public.app_role[])
    )
  );

create policy procedure_kit_items_select on public.procedure_kit_items
  for select using (
    exists (
      select 1
      from public.procedure_kits k
      join public.procedures p on p.id = k.procedure_id
      where k.id = kit_id
        and (
          public.is_house_member(p.organization_id)
          or (
            p.practice_id is not null
            and public.has_practice_role(
              p.practice_id,
              array['owner', 'admin', 'secretary', 'physician']::public.app_role[]
            )
          )
        )
    )
  );

create policy procedure_kit_items_write on public.procedure_kit_items
  for insert with check (
    exists (
      select 1
      from public.procedure_kits k
      join public.procedures p on p.id = k.procedure_id
      where k.id = kit_id
        and public.is_house_staff(p.organization_id, array['owner', 'admin', 'physician']::public.app_role[])
    )
  );

create policy procedure_kit_items_update on public.procedure_kit_items
  for update using (
    exists (
      select 1
      from public.procedure_kits k
      join public.procedures p on p.id = k.procedure_id
      where k.id = kit_id
        and public.is_house_staff(p.organization_id, array['owner', 'admin', 'physician']::public.app_role[])
    )
  )
  with check (
    exists (
      select 1
      from public.procedure_kits k
      join public.procedures p on p.id = k.procedure_id
      where k.id = kit_id
        and public.is_house_staff(p.organization_id, array['owner', 'admin', 'physician']::public.app_role[])
    )
  );

create policy procedure_kit_items_delete on public.procedure_kit_items
  for delete using (
    exists (
      select 1
      from public.procedure_kits k
      join public.procedures p on p.id = k.procedure_id
      where k.id = kit_id
        and public.is_house_staff(p.organization_id, array['owner', 'admin', 'physician']::public.app_role[])
    )
  );

create policy stock_movements_select on public.stock_movements
  for select using (public.can_access_stock(organization_id));

create policy stock_movements_insert on public.stock_movements
  for insert with check (
    public.can_access_stock(organization_id)
    and created_by = auth.uid()
  );

create policy audit_events_owner_select on public.audit_events
  for select using (
    public.is_house_staff(public.current_org_id(), array['owner']::public.app_role[])
  );

comment on table public.clinical_notes is
  'Prontuário isolado por prática. Somente physician (DOCTOR) da prática. OWNER sozinho não lê/escreve. Secretaria não acessa.';
comment on table public.encounters is
  'Atendimento clínico da prática. Secretaria, ADMIN e OWNER sem DOCTOR não selecionam esta tabela.';
