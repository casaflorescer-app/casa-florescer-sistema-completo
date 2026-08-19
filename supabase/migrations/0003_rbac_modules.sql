-- Módulos RBAC: portal da paciente, capacidade, obstetrícia, exames e alertas.
-- Paciente NÃO entra em app_role (staff). Autentica via patient_accounts.

create type public.appointment_kind as enum ('consultation', 'procedure');
create type public.exam_status as enum ('pending', 'available', 'picked_up');
create type public.alert_severity as enum ('info', 'warning', 'urgent');
create type public.alert_audience as enum ('secretary', 'physician', 'admin', 'all_staff');

alter table public.appointments
  add column if not exists kind public.appointment_kind not null default 'consultation',
  add column if not exists urgency_note text;

create table public.patient_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  patient_id uuid not null unique references public.patients (id),
  organization_id uuid not null references public.organizations (id),
  created_at timestamptz not null default now()
);

create table public.daily_capacity (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals (id),
  practice_id uuid not null references public.practice_units (id),
  kind public.appointment_kind not null,
  weekday smallint check (weekday is null or weekday between 0 and 6),
  max_patients integer not null check (max_patients > 0),
  unique (professional_id, kind, weekday)
);

create table public.obstetric_followups (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practice_units (id),
  patient_id uuid not null references public.patients (id),
  professional_id uuid not null references public.professionals (id),
  lmp_date date,
  edd date not null,
  gestational_risk text,
  notes text,
  created_at timestamptz not null default now()
);

create index obstetric_followups_edd_idx
  on public.obstetric_followups (practice_id, edd);

create table public.exam_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  patient_id uuid not null references public.patients (id),
  requested_by uuid references public.professionals (id),
  title text not null,
  status public.exam_status not null default 'pending',
  requested_at timestamptz not null default now(),
  available_at timestamptz,
  picked_up_at timestamptz,
  picked_up_by uuid references public.profiles (id)
);

create table public.exam_uploads (
  id uuid primary key default gen_random_uuid(),
  exam_order_id uuid references public.exam_orders (id),
  patient_id uuid not null references public.patients (id),
  practice_id uuid not null references public.practice_units (id),
  storage_path text not null,
  original_name text not null,
  uploaded_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.professionals (id)
);

create table public.return_reminders (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id),
  practice_id uuid not null references public.practice_units (id),
  due_on date not null,
  channel text not null default 'whatsapp',
  sent_at timestamptz,
  template_code text not null default 'annual_return'
);

create table public.agenda_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid references public.practice_units (id),
  appointment_id uuid references public.appointments (id),
  audience public.alert_audience not null default 'all_staff',
  severity public.alert_severity not null default 'warning',
  title text not null,
  body text not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz
);

create table public.stock_audits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  warehouse_id uuid not null references public.warehouses (id),
  counted_by uuid not null references public.profiles (id),
  counted_at timestamptz not null default now(),
  notes text
);

create table public.stock_audit_lines (
  audit_id uuid not null references public.stock_audits (id) on delete cascade,
  item_id uuid not null references public.items (id),
  lot_id uuid references public.item_lots (id),
  expected_qty numeric(12, 3) not null,
  counted_qty numeric(12, 3) not null,
  primary key (audit_id, item_id)
);

alter table public.patient_accounts enable row level security;
alter table public.daily_capacity enable row level security;
alter table public.obstetric_followups enable row level security;
alter table public.exam_orders enable row level security;
alter table public.exam_uploads enable row level security;
alter table public.return_reminders enable row level security;
alter table public.agenda_alerts enable row level security;
alter table public.stock_audits enable row level security;
alter table public.stock_audit_lines enable row level security;

create or replace function public.is_patient_self(p_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.patient_accounts a
    where a.user_id = auth.uid()
      and a.patient_id = p_patient
  )
$$;

create policy patients_self_read on public.patients
  for select using (public.is_patient_self(id));

create policy patient_accounts_self on public.patient_accounts
  for select using (user_id = auth.uid());

create policy exam_orders_staff on public.exam_orders
  for all using (
    public.has_practice_role(practice_id, array['owner', 'admin', 'secretary', 'physician']::public.app_role[])
  )
  with check (
    public.has_practice_role(practice_id, array['owner', 'admin', 'secretary', 'physician']::public.app_role[])
  );

create policy exam_orders_patient on public.exam_orders
  for select using (public.is_patient_self(patient_id));

create policy exam_uploads_patient_insert on public.exam_uploads
  for insert with check (public.is_patient_self(patient_id));

create policy exam_uploads_patient_read on public.exam_uploads
  for select using (
    public.is_patient_self(patient_id)
    or public.has_practice_role(practice_id, array['owner', 'admin', 'secretary', 'physician']::public.app_role[])
  );

create policy obstetric_physician on public.obstetric_followups
  for all using (
    public.has_practice_role(practice_id, array['physician', 'owner']::public.app_role[])
  )
  with check (
    public.has_practice_role(practice_id, array['physician', 'owner']::public.app_role[])
  );

create policy capacity_physician on public.daily_capacity
  for all using (
    public.has_practice_role(practice_id, array['physician', 'owner', 'secretary']::public.app_role[])
  )
  with check (
    public.has_practice_role(practice_id, array['physician', 'owner']::public.app_role[])
  );

create policy alerts_staff_read on public.agenda_alerts
  for select using (
    exists (
      select 1 from public.user_practice_roles r
      where r.user_id = auth.uid()
        and r.role in ('owner', 'admin', 'secretary', 'physician')
    )
  );

create policy appointments_patient_read on public.appointments
  for select using (public.is_patient_self(patient_id));

create policy stock_audits_ops on public.stock_audits
  for all using (
    exists (
      select 1 from public.user_practice_roles r
      where r.user_id = auth.uid()
        and r.role in ('owner', 'admin', 'inventory')
    )
  )
  with check (
    exists (
      select 1 from public.user_practice_roles r
      where r.user_id = auth.uid()
        and r.role in ('owner', 'admin', 'inventory')
    )
  );

comment on table public.patient_accounts is
  'Vínculo auth.users → patients. Isola o portal: a paciente só vê o próprio MPI.';
comment on table public.agenda_alerts is
  'Alerta global de urgência (parto, encaixe, cancelamento em massa).';
comment on table public.daily_capacity is
  'Teto diário definido pela médica por consulta vs procedimento.';
