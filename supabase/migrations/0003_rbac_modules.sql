-- Portal da paciente, capacidade, obstetrícia, exames, receitas e alertas.
-- Paciente NÃO entra em app_role. Autentica via patient_accounts.
-- DOCTOR funcional = physician técnico.

create type public.appointment_kind as enum ('consultation', 'procedure');
create type public.exam_status as enum ('pending', 'received', 'available', 'picked_up');
create type public.alert_severity as enum ('info', 'warning', 'urgent');
create type public.alert_audience as enum ('secretary', 'physician', 'admin', 'all_staff');
create type public.prescription_status as enum ('draft', 'signed', 'dispatched', 'cancelled');

alter table public.appointments
  add column if not exists kind public.appointment_kind not null default 'consultation',
  add column if not exists urgency_note text;

-- ---------------------------------------------------------------------------
-- Portal da paciente (fora do RBAC de staff)
-- ---------------------------------------------------------------------------

create table public.patient_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  patient_id uuid not null unique references public.patients (id),
  organization_id uuid not null references public.organizations (id),
  created_at timestamptz not null default now()
);

comment on table public.patient_accounts is
  'Vínculo auth.users → patients. Isola o portal. Não criar profiles.role = patient. Não misturar com staff.';

-- ---------------------------------------------------------------------------
-- Capacidade, obstetrícia, exames, lembretes, alertas
-- ---------------------------------------------------------------------------

create table public.daily_capacity (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals (id),
  practice_id uuid not null references public.practice_units (id),
  organization_id uuid not null references public.organizations (id),
  kind public.appointment_kind not null,
  weekday smallint check (weekday is null or weekday between 0 and 6),
  max_patients integer not null check (max_patients > 0),
  unique (professional_id, practice_id, kind, weekday)
);

create table public.obstetric_followups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
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
  received_at timestamptz,
  received_by uuid references public.profiles (id),
  available_at timestamptz,
  picked_up_at timestamptz,
  picked_up_by uuid references public.profiles (id),
  unique (id, patient_id, practice_id, organization_id)
);

comment on column public.exam_orders.status is
  'pending → received (secretaria conferiu/anexou) → available → picked_up.';

create table public.exam_uploads (
  id uuid primary key default gen_random_uuid(),
  exam_order_id uuid not null references public.exam_orders (id),
  organization_id uuid not null references public.organizations (id),
  patient_id uuid not null references public.patients (id),
  practice_id uuid not null references public.practice_units (id),
  storage_path text not null,
  original_name text not null,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  reviewed_by uuid references public.professionals (id),
  constraint exam_uploads_matches_order_fk
    foreign key (exam_order_id, patient_id, practice_id, organization_id)
    references public.exam_orders (id, patient_id, practice_id, organization_id)
);

create table public.return_reminders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
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

-- ---------------------------------------------------------------------------
-- Receitas estruturadas
-- ---------------------------------------------------------------------------

create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  patient_id uuid not null references public.patients (id),
  encounter_id uuid references public.encounters (id),
  professional_id uuid not null references public.professionals (id),
  status public.prescription_status not null default 'draft',
  notes text,
  signed_at timestamptz,
  signed_by uuid references public.profiles (id),
  dispatched_at timestamptz,
  dispatched_by uuid references public.profiles (id),
  delivery_channel text,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles (id),
  check (
    (status = 'draft' and signed_at is null and signed_by is null)
    or (status = 'signed' and signed_at is not null and signed_by is not null)
    or (status = 'dispatched' and signed_at is not null and signed_by is not null and dispatched_at is not null)
    or (status = 'cancelled')
  )
);

create table public.prescription_items (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.prescriptions (id) on delete restrict,
  medication_name text not null,
  presentation text,
  quantity text,
  dosage text,
  frequency text,
  duration text,
  route text,
  instructions text,
  sort_order integer not null default 0
);

comment on table public.prescriptions is
  'Receita médica. Somente physician cria/edita/assina. Secretaria visualiza e encaminha apenas signed/dispatched.';
comment on table public.prescription_items is
  'Itens estruturados: medicamento, apresentação, quantidade, posologia, frequência, duração, via, observações.';

-- ---------------------------------------------------------------------------
-- Funções desta migration
-- ---------------------------------------------------------------------------

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

create or replace function public.is_house_ops(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_house_staff(p_org, array['owner', 'admin', 'secretary']::public.app_role[])
$$;

create or replace function public.can_read_exam_file(p_practice uuid, p_patient uuid, p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_patient_self(p_patient)
  or public.has_practice_role(p_practice, array['physician']::public.app_role[])
  or public.is_house_ops(p_org)
  or public.has_active_break_glass(p_practice, p_patient)
$$;

create or replace function public.can_manage_prescription_ops(p_practice uuid, p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_house_ops(p_org)
  or public.has_practice_role(p_practice, array['secretary']::public.app_role[])
$$;

create or replace function public.can_sign_prescription(p_practice uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_practice_role(p_practice, array['physician']::public.app_role[])
$$;

create or replace function public.matches_alert_audience(p_audience public.alert_audience, p_org uuid, p_practice uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p_audience
    when 'all_staff' then public.is_house_member(p_org)
    when 'secretary' then
      public.is_house_staff(p_org, array['secretary']::public.app_role[])
      or (p_practice is not null and public.has_practice_role(p_practice, array['secretary']::public.app_role[]))
    when 'physician' then
      (p_practice is not null and public.has_practice_role(p_practice, array['physician']::public.app_role[]))
      or public.is_house_staff(p_org, array['physician']::public.app_role[])
    when 'admin' then public.is_house_staff(p_org, array['owner', 'admin']::public.app_role[])
    else false
  end
$$;

revoke all on function public.is_patient_self(uuid) from public;
revoke all on function public.is_house_ops(uuid) from public;
revoke all on function public.can_read_exam_file(uuid, uuid, uuid) from public;
revoke all on function public.can_manage_prescription_ops(uuid, uuid) from public;
revoke all on function public.can_sign_prescription(uuid) from public;
revoke all on function public.matches_alert_audience(public.alert_audience, uuid, uuid) from public;

grant execute on function public.is_patient_self(uuid) to authenticated;
grant execute on function public.is_house_ops(uuid) to authenticated;
grant execute on function public.can_read_exam_file(uuid, uuid, uuid) to authenticated;
grant execute on function public.can_manage_prescription_ops(uuid, uuid) to authenticated;
grant execute on function public.can_sign_prescription(uuid) to authenticated;
grant execute on function public.matches_alert_audience(public.alert_audience, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.user_practice_roles_before_write()
returns trigger
language plpgsql
as $$
declare
  v_kind public.practice_kind;
begin
  if exists (select 1 from public.patient_accounts a where a.user_id = new.user_id) then
    raise exception 'Conta de paciente não pode receber papel de staff.';
  end if;

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

create or replace function public.patient_accounts_before_write()
returns trigger
language plpgsql
as $$
declare
  v_org uuid;
begin
  if exists (select 1 from public.user_practice_roles r where r.user_id = new.user_id) then
    raise exception 'Staff não pode possuir patient_accounts no mesmo usuário.';
  end if;
  if exists (select 1 from public.system_admins s where s.user_id = new.user_id and s.revoked_at is null) then
    raise exception 'SYSTEM_ADMIN não pode possuir patient_accounts.';
  end if;

  select organization_id into v_org from public.patients where id = new.patient_id;
  if v_org is null then
    raise exception 'Paciente inexistente.';
  end if;
  if new.organization_id is distinct from v_org then
    raise exception 'patient_accounts.organization_id deve coincidir com a paciente.';
  end if;

  return new;
end;
$$;

create or replace function public.exam_uploads_before_write()
returns trigger
language plpgsql
as $$
declare
  v_ord public.exam_orders%rowtype;
begin
  new.organization_id := public.resolve_org_from_practice(new.practice_id, new.organization_id);

  select * into v_ord from public.exam_orders where id = new.exam_order_id;
  if v_ord.id is null then
    raise exception 'Upload sem pedido de exame.';
  end if;
  if new.patient_id is distinct from v_ord.patient_id
     or new.practice_id is distinct from v_ord.practice_id
     or new.organization_id is distinct from v_ord.organization_id then
    raise exception 'Upload deve pertencer ao mesmo paciente, prática e organização do pedido.';
  end if;
  return new;
end;
$$;

create or replace function public.exam_orders_before_write()
returns trigger
language plpgsql
as $$
declare
  v_patient_org uuid;
  v_physician boolean;
begin
  new.organization_id := public.resolve_org_from_practice(new.practice_id, new.organization_id);

  select organization_id into v_patient_org from public.patients where id = new.patient_id;
  if v_patient_org is distinct from new.organization_id then
    raise exception 'Pedido de exame cruza organização.';
  end if;

  if tg_op = 'UPDATE' then
    v_physician := public.has_practice_role(old.practice_id, array['physician']::public.app_role[]);
    if not v_physician then
      if new.patient_id is distinct from old.patient_id
         or new.practice_id is distinct from old.practice_id
         or new.organization_id is distinct from old.organization_id
         or new.requested_by is distinct from old.requested_by
         or new.title is distinct from old.title then
        raise exception 'Secretaria não pode alterar vínculo clínico do pedido; apenas status operacional.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.prescriptions_before_write()
returns trigger
language plpgsql
as $$
declare
  v_patient_org uuid;
  v_prof_practice uuid;
  v_enc public.encounters%rowtype;
  v_is_physician boolean;
  v_is_ops boolean;
begin
  new.organization_id := public.resolve_org_from_practice(new.practice_id, new.organization_id);

  select organization_id into v_patient_org from public.patients where id = new.patient_id;
  select practice_id into v_prof_practice from public.professionals where id = new.professional_id;

  if v_patient_org is distinct from new.organization_id
     or v_prof_practice is distinct from new.practice_id then
    raise exception 'Receita fora do escopo organização/prática/profissional.';
  end if;

  if new.encounter_id is not null then
    select * into v_enc from public.encounters where id = new.encounter_id;
    if v_enc.practice_id is distinct from new.practice_id
       or v_enc.patient_id is distinct from new.patient_id then
      raise exception 'Receita diverge do encounter.';
    end if;
  end if;

  v_is_physician := public.can_sign_prescription(new.practice_id);
  v_is_ops := public.can_manage_prescription_ops(new.practice_id, new.organization_id);

  if tg_op = 'INSERT' then
    if not v_is_physician then
      raise exception 'Somente o médico (physician) pode criar receita.';
    end if;
    if new.status is distinct from 'draft' then
      raise exception 'Receita nasce como draft.';
    end if;
    if new.created_by is distinct from auth.uid() then
      raise exception 'created_by deve ser o médico autenticado.';
    end if;
    return new;
  end if;

  if v_is_physician then
    if old.status in ('signed', 'dispatched')
       and (
         new.patient_id is distinct from old.patient_id
         or new.professional_id is distinct from old.professional_id
         or new.notes is distinct from old.notes
         or new.encounter_id is distinct from old.encounter_id
       )
       and new.status is distinct from 'cancelled' then
      raise exception 'Receita assinada não pode ter o conteúdo alterado.';
    end if;
    if new.status = 'signed' and old.status = 'draft' then
      new.signed_at := coalesce(new.signed_at, now());
      new.signed_by := auth.uid();
    end if;
    return new;
  end if;

  if v_is_ops then
    if old.status is distinct from 'signed' then
      raise exception 'Secretaria só encaminha receitas com status signed.';
    end if;
    if new.status is distinct from 'dispatched' then
      raise exception 'Secretaria só pode transitar signed → dispatched.';
    end if;
    if new.notes is distinct from old.notes
       or new.patient_id is distinct from old.patient_id
       or new.professional_id is distinct from old.professional_id
       or new.encounter_id is distinct from old.encounter_id
       or new.signed_by is distinct from old.signed_by
       or new.signed_at is distinct from old.signed_at
       or new.practice_id is distinct from old.practice_id
       or new.organization_id is distinct from old.organization_id
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Secretaria não pode alterar conteúdo clínico ou assinatura da receita.';
    end if;
    new.dispatched_at := coalesce(new.dispatched_at, now());
    new.dispatched_by := coalesce(new.dispatched_by, auth.uid());
    return new;
  end if;

  raise exception 'Sem permissão para alterar receita.';
end;
$$;

create or replace function public.daily_capacity_before_write()
returns trigger
language plpgsql
as $$
declare
  v_prof_practice uuid;
begin
  new.organization_id := public.resolve_org_from_practice(new.practice_id, new.organization_id);

  select practice_id into v_prof_practice from public.professionals where id = new.professional_id;
  if v_prof_practice is distinct from new.practice_id then
    raise exception 'Capacidade: profissional de outra prática.';
  end if;
  return new;
end;
$$;

create or replace function public.agenda_alerts_before_write()
returns trigger
language plpgsql
as $$
begin
  if new.practice_id is not null then
    new.organization_id := public.resolve_org_from_practice(new.practice_id, new.organization_id);
  elsif new.organization_id is null then
    new.organization_id := public.current_org_id();
  end if;

  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id
       or new.practice_id is distinct from old.practice_id
       or new.appointment_id is distinct from old.appointment_id
       or new.audience is distinct from old.audience
       or new.severity is distinct from old.severity
       or new.title is distinct from old.title
       or new.body is distinct from old.body
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Somente acknowledged_at pode ser alterado no alerta.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.prescriptions_after_sign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'signed' and old.status is distinct from 'signed' then
    perform public.write_audit(
      'sign',
      'prescriptions',
      new.id,
      new.practice_id,
      new.patient_id,
      jsonb_build_object('signed_by', new.signed_by)
    );
  end if;
  return new;
end;
$$;

create or replace function public.prescription_items_guard()
returns trigger
language plpgsql
as $$
declare
  v_rx public.prescriptions%rowtype;
begin
  select * into v_rx
  from public.prescriptions
  where id = coalesce(new.prescription_id, old.prescription_id);

  if not public.can_sign_prescription(v_rx.practice_id) then
    raise exception 'Somente o médico pode alterar itens da receita.';
  end if;
  if v_rx.status is distinct from 'draft' then
    raise exception 'Itens só podem ser alterados enquanto a receita está em draft.';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists patient_accounts_before_write on public.patient_accounts;
create trigger patient_accounts_before_write
  before insert or update
  on public.patient_accounts
  for each row execute function public.patient_accounts_before_write();

drop trigger if exists daily_capacity_sync_org on public.daily_capacity;
drop trigger if exists daily_capacity_scope_check on public.daily_capacity;
drop trigger if exists daily_capacity_before_write on public.daily_capacity;
create trigger daily_capacity_before_write
  before insert or update
  on public.daily_capacity
  for each row execute function public.daily_capacity_before_write();

drop trigger if exists obstetric_followups_sync_org on public.obstetric_followups;
create trigger obstetric_followups_sync_org
  before insert or update of practice_id, organization_id
  on public.obstetric_followups
  for each row execute function public.sync_org_from_practice();

drop trigger if exists exam_orders_sync_org on public.exam_orders;
drop trigger if exists exam_orders_scope_check on public.exam_orders;
drop trigger if exists exam_orders_before_write on public.exam_orders;
create trigger exam_orders_before_write
  before insert or update
  on public.exam_orders
  for each row execute function public.exam_orders_before_write();

drop trigger if exists exam_uploads_sync_org on public.exam_uploads;
drop trigger if exists exam_uploads_scope_check on public.exam_uploads;
drop trigger if exists exam_uploads_before_write on public.exam_uploads;
create trigger exam_uploads_before_write
  before insert or update
  on public.exam_uploads
  for each row execute function public.exam_uploads_before_write();

drop trigger if exists return_reminders_sync_org on public.return_reminders;
create trigger return_reminders_sync_org
  before insert or update of practice_id, organization_id
  on public.return_reminders
  for each row execute function public.sync_org_from_practice();

drop trigger if exists prescriptions_sync_org on public.prescriptions;
drop trigger if exists prescriptions_scope_check on public.prescriptions;
drop trigger if exists prescriptions_guard_content on public.prescriptions;
drop trigger if exists prescriptions_before_write on public.prescriptions;
create trigger prescriptions_before_write
  before insert or update
  on public.prescriptions
  for each row execute function public.prescriptions_before_write();

drop trigger if exists prescriptions_after_sign on public.prescriptions;
create trigger prescriptions_after_sign
  after update
  on public.prescriptions
  for each row execute function public.prescriptions_after_sign();

drop trigger if exists prescription_items_guard on public.prescription_items;
create trigger prescription_items_guard
  before insert or update or delete
  on public.prescription_items
  for each row execute function public.prescription_items_guard();

drop trigger if exists agenda_alerts_before_write on public.agenda_alerts;
create trigger agenda_alerts_before_write
  before insert or update
  on public.agenda_alerts
  for each row execute function public.agenda_alerts_before_write();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.patient_accounts enable row level security;
alter table public.daily_capacity enable row level security;
alter table public.obstetric_followups enable row level security;
alter table public.exam_orders enable row level security;
alter table public.exam_uploads enable row level security;
alter table public.return_reminders enable row level security;
alter table public.agenda_alerts enable row level security;
alter table public.stock_audits enable row level security;
alter table public.stock_audit_lines enable row level security;
alter table public.prescriptions enable row level security;
alter table public.prescription_items enable row level security;

create policy patients_self_select on public.patients
  for select using (public.is_patient_self(id));

create policy patient_accounts_self on public.patient_accounts
  for select using (user_id = auth.uid());

create policy patient_accounts_house_select on public.patient_accounts
  for select using (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  );

create policy appointments_patient_select on public.appointments
  for select using (public.is_patient_self(patient_id));

create policy daily_capacity_select on public.daily_capacity
  for select using (
    public.has_practice_role(practice_id, array['physician', 'secretary']::public.app_role[])
    or public.is_house_ops(organization_id)
  );

create policy daily_capacity_physician_write on public.daily_capacity
  for all using (public.has_practice_role(practice_id, array['physician']::public.app_role[]))
  with check (public.has_practice_role(practice_id, array['physician']::public.app_role[]));

create policy obstetric_followups_clinical on public.obstetric_followups
  for all using (
    public.can_read_clinical(practice_id, patient_id, professional_id)
    or public.can_write_clinical(practice_id)
  )
  with check (public.can_write_clinical(practice_id));

create policy exam_orders_staff_select on public.exam_orders
  for select using (
    public.is_house_ops(organization_id)
    or public.has_practice_role(practice_id, array['physician']::public.app_role[])
  );

create policy exam_orders_patient_select on public.exam_orders
  for select using (public.is_patient_self(patient_id));

create policy exam_orders_physician_insert on public.exam_orders
  for insert with check (
    public.has_practice_role(practice_id, array['physician']::public.app_role[])
  );

create policy exam_orders_ops_update on public.exam_orders
  for update using (
    public.is_house_ops(organization_id)
    or public.has_practice_role(practice_id, array['physician']::public.app_role[])
  )
  with check (
    public.is_house_ops(organization_id)
    or public.has_practice_role(practice_id, array['physician']::public.app_role[])
  );

create policy exam_uploads_select on public.exam_uploads
  for select using (
    public.can_read_exam_file(practice_id, patient_id, organization_id)
  );

create policy exam_uploads_patient_insert on public.exam_uploads
  for insert with check (
    public.is_patient_self(patient_id)
    and exists (
      select 1 from public.exam_orders o
      where o.id = exam_order_id
        and o.patient_id = exam_uploads.patient_id
        and o.practice_id = exam_uploads.practice_id
        and o.organization_id = exam_uploads.organization_id
    )
  );

create policy exam_uploads_ops_insert on public.exam_uploads
  for insert with check (
    public.is_house_ops(organization_id)
    or public.has_practice_role(practice_id, array['physician']::public.app_role[])
  );

create policy exam_uploads_review_update on public.exam_uploads
  for update using (
    public.has_practice_role(practice_id, array['physician']::public.app_role[])
  )
  with check (
    public.has_practice_role(practice_id, array['physician']::public.app_role[])
  );

create policy return_reminders_staff on public.return_reminders
  for all using (
    public.is_house_ops(organization_id)
    or public.has_practice_role(practice_id, array['physician', 'secretary']::public.app_role[])
  )
  with check (
    public.is_house_ops(organization_id)
    or public.has_practice_role(practice_id, array['physician', 'secretary']::public.app_role[])
  );

create policy return_reminders_patient_select on public.return_reminders
  for select using (public.is_patient_self(patient_id));

create policy agenda_alerts_select on public.agenda_alerts
  for select using (
    (
      practice_id is null
      and public.is_house_member(organization_id)
      and public.matches_alert_audience(audience, organization_id, null)
    )
    or (
      practice_id is not null
      and (
        public.has_practice_role(practice_id, array['owner', 'admin', 'secretary', 'physician']::public.app_role[])
        or public.is_house_ops(organization_id)
      )
      and public.matches_alert_audience(audience, organization_id, practice_id)
    )
  );

create policy agenda_alerts_write on public.agenda_alerts
  for insert with check (
    public.is_house_ops(organization_id)
    or (
      practice_id is not null
      and public.has_practice_role(practice_id, array['owner', 'admin', 'secretary', 'physician']::public.app_role[])
    )
  );

create policy agenda_alerts_ack on public.agenda_alerts
  for update using (
    (
      practice_id is null
      and public.is_house_member(organization_id)
    )
    or (
      practice_id is not null
      and (
        public.has_practice_role(practice_id, array['owner', 'admin', 'secretary', 'physician']::public.app_role[])
        or public.is_house_ops(organization_id)
      )
    )
  )
  with check (
    (
      practice_id is null
      and public.is_house_member(organization_id)
    )
    or (
      practice_id is not null
      and (
        public.has_practice_role(practice_id, array['owner', 'admin', 'secretary', 'physician']::public.app_role[])
        or public.is_house_ops(organization_id)
      )
    )
  );

create policy stock_audits_ops on public.stock_audits
  for all using (public.can_access_stock(organization_id))
  with check (public.can_access_stock(organization_id));

create policy stock_audit_lines_ops on public.stock_audit_lines
  for all using (
    exists (
      select 1 from public.stock_audits a
      where a.id = audit_id and public.can_access_stock(a.organization_id)
    )
  )
  with check (
    exists (
      select 1 from public.stock_audits a
      where a.id = audit_id and public.can_access_stock(a.organization_id)
    )
  );

create policy prescriptions_physician_all on public.prescriptions
  for all using (public.can_sign_prescription(practice_id))
  with check (public.can_sign_prescription(practice_id));

create policy prescriptions_ops_select on public.prescriptions
  for select using (
    public.can_manage_prescription_ops(practice_id, organization_id)
    and status in ('signed', 'dispatched')
  );

create policy prescriptions_ops_update on public.prescriptions
  for update using (
    public.can_manage_prescription_ops(practice_id, organization_id)
    and status = 'signed'
  )
  with check (
    public.can_manage_prescription_ops(practice_id, organization_id)
    and status = 'dispatched'
  );

create policy prescriptions_patient_select on public.prescriptions
  for select using (
    public.is_patient_self(patient_id)
    and status in ('signed', 'dispatched')
  );

create policy prescription_items_physician on public.prescription_items
  for all using (
    exists (
      select 1 from public.prescriptions rx
      where rx.id = prescription_id
        and public.can_sign_prescription(rx.practice_id)
    )
  )
  with check (
    exists (
      select 1 from public.prescriptions rx
      where rx.id = prescription_id
        and public.can_sign_prescription(rx.practice_id)
        and rx.status = 'draft'
    )
  );

create policy prescription_items_ops_select on public.prescription_items
  for select using (
    exists (
      select 1 from public.prescriptions rx
      where rx.id = prescription_id
        and rx.status in ('signed', 'dispatched')
        and public.can_manage_prescription_ops(rx.practice_id, rx.organization_id)
    )
  );

create policy prescription_items_patient_select on public.prescription_items
  for select using (
    exists (
      select 1 from public.prescriptions rx
      where rx.id = prescription_id
        and rx.status in ('signed', 'dispatched')
        and public.is_patient_self(rx.patient_id)
    )
  );

comment on table public.exam_uploads is
  'Arquivo vinculado obrigatoriamente ao pedido. Secretaria anexa e lê para operação; não abre clinical_notes/encounters.';
comment on table public.agenda_alerts is
  'Alerta da casa (practice_id nulo) ou da prática. RLS filtra organização, prática e audience.';
