-- C032.1 — Fundação temporal da agenda dinâmica
-- Snapshot agendado imutável + tempos efetivos + estrutura de previsões versionável.
-- NÃO implementa motor de previsão, portal, notificações, encaixe ou bloqueio.
-- NÃO altera SOAP, pregnancy, grants nem RLS de prontuário.

-- ---------------------------------------------------------------------------
-- 1) Campos temporais em appointments
-- ---------------------------------------------------------------------------

alter table public.appointments
  add column if not exists scheduled_starts_at timestamptz,
  add column if not exists scheduled_ends_at timestamptz,
  add column if not exists arrival_at timestamptz,
  add column if not exists arrival_recorded_by uuid references public.profiles (id),
  add column if not exists actual_start_at timestamptz,
  add column if not exists actual_start_recorded_by uuid references public.profiles (id),
  add column if not exists actual_end_at timestamptz,
  add column if not exists actual_end_recorded_by uuid references public.profiles (id);

comment on column public.appointments.scheduled_starts_at is
  'C032.1: snapshot do horário agendado. Backfill = starts_at na implantação (primeiro snapshot disponível, não necessariamente o original pré-C032.1). Imutável após criação.';
comment on column public.appointments.scheduled_ends_at is
  'C032.1: snapshot do fim agendado. Mesma semântica de scheduled_starts_at.';
comment on column public.appointments.arrival_at is
  'C032.1: chegada física da paciente. Distinto de checkin_at administrativo.';
comment on column public.appointments.actual_start_at is
  'C032.1: início clínico efetivo. Distinto de signed_at.';
comment on column public.appointments.actual_end_at is
  'C032.1: término clínico efetivo. NÃO preenchido automaticamente pela assinatura.';

-- Primeiro snapshot disponível para registros já existentes.
update public.appointments
   set scheduled_starts_at = coalesce(scheduled_starts_at, starts_at),
       scheduled_ends_at = coalesce(scheduled_ends_at, ends_at)
 where scheduled_starts_at is null
    or scheduled_ends_at is null;

alter table public.appointments
  alter column scheduled_starts_at set not null,
  alter column scheduled_ends_at set not null;

alter table public.appointments
  drop constraint if exists appointments_scheduled_range_check;

alter table public.appointments
  add constraint appointments_scheduled_range_check
  check (scheduled_ends_at > scheduled_starts_at);

-- ---------------------------------------------------------------------------
-- 2) Guarda temporal (snapshot + tempos efetivos)
-- ---------------------------------------------------------------------------

create or replace function public.appointments_guard_temporal()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    if new.scheduled_starts_at is null then
      new.scheduled_starts_at := new.starts_at;
    end if;
    if new.scheduled_ends_at is null then
      new.scheduled_ends_at := new.ends_at;
    end if;
    if new.scheduled_ends_at <= new.scheduled_starts_at then
      raise exception 'APPOINTMENT_SCHEDULED_RANGE_INVALID';
    end if;
    return new;
  end if;

  if TG_OP = 'UPDATE' then
    if new.scheduled_starts_at is distinct from old.scheduled_starts_at
       or new.scheduled_ends_at is distinct from old.scheduled_ends_at then
      raise exception 'APPOINTMENT_SCHEDULED_SNAPSHOT_LOCKED';
    end if;

    -- Tempos efetivos: só preencher; não reescrever nem limpar.
    if old.arrival_at is not null and new.arrival_at is distinct from old.arrival_at then
      raise exception 'APPOINTMENT_ARRIVAL_LOCKED';
    end if;
    if old.arrival_recorded_by is not null
       and new.arrival_recorded_by is distinct from old.arrival_recorded_by then
      raise exception 'APPOINTMENT_ARRIVAL_LOCKED';
    end if;

    if old.actual_start_at is not null
       and new.actual_start_at is distinct from old.actual_start_at then
      raise exception 'APPOINTMENT_ACTUAL_START_LOCKED';
    end if;
    if old.actual_start_recorded_by is not null
       and new.actual_start_recorded_by is distinct from old.actual_start_recorded_by then
      raise exception 'APPOINTMENT_ACTUAL_START_LOCKED';
    end if;

    if old.actual_end_at is not null
       and new.actual_end_at is distinct from old.actual_end_at then
      raise exception 'APPOINTMENT_ACTUAL_END_LOCKED';
    end if;
    if old.actual_end_recorded_by is not null
       and new.actual_end_recorded_by is distinct from old.actual_end_recorded_by then
      raise exception 'APPOINTMENT_ACTUAL_END_LOCKED';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.appointments_guard_temporal() is
  'C032.1: preenche snapshot na criação; impede alteração do snapshot e reescrita de tempos efetivos.';

drop trigger if exists appointments_guard_temporal on public.appointments;
create trigger appointments_guard_temporal
  before insert or update on public.appointments
  for each row
  execute function public.appointments_guard_temporal();

-- ---------------------------------------------------------------------------
-- 3) Previsões versionáveis (sem algoritmo nesta etapa)
-- ---------------------------------------------------------------------------

create table if not exists public.appointment_predictions (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  prediction_version integer not null check (prediction_version > 0),
  predicted_starts_at timestamptz not null,
  predicted_ends_at timestamptz not null,
  prediction_reason text,
  calculated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  check (predicted_ends_at > predicted_starts_at),
  unique (appointment_id, prediction_version)
);

create index if not exists appointment_predictions_appointment_idx
  on public.appointment_predictions (appointment_id, prediction_version desc);

comment on table public.appointment_predictions is
  'C032.1: histórico versionável de previsões (uso interno/staff). Motor de recálculo fica para etapa futura. Nunca sobrescreve starts_at/ends_at nem scheduled_*. prediction_reason é interno e não deve ser exposto à paciente.';

comment on column public.appointment_predictions.prediction_reason is
  'C032.1: motivo operacional interno (ex.: atraso, emergência). NÃO expor à paciente. Camada pública/sanitizada fica para etapa futura.';

alter table public.appointment_predictions enable row level security;

drop policy if exists appointment_predictions_staff_select on public.appointment_predictions;
create policy appointment_predictions_staff_select on public.appointment_predictions
  for select using (
    public.can_schedule_in_org(organization_id, practice_id)
  );

-- Paciente NÃO lê appointment_predictions diretamente (prediction_reason é interno).
-- Portal futuro deverá usar camada pública/sanitizada, sem esta tabela bruta.
drop policy if exists appointment_predictions_patient_select on public.appointment_predictions;

-- Sem policies de INSERT/UPDATE/DELETE para authenticated nesta etapa.
revoke all on table public.appointment_predictions from public;
revoke all on table public.appointment_predictions from anon;
grant select on table public.appointment_predictions to authenticated;

-- ---------------------------------------------------------------------------
-- 4) encounter_open_from_appointment: grava actual_start_at (se nulo)
-- ---------------------------------------------------------------------------

create or replace function public.encounter_open_from_appointment(
  p_appointment_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appt public.appointments%rowtype;
  v_prof public.professionals%rowtype;
  v_enc_id uuid;
  v_existing uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_appt
  from public.appointments
  where id = p_appointment_id
  for update;

  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active
  ) then
    raise exception 'PROFILE_INACTIVE';
  end if;

  if not public.can_write_clinical(v_appt.practice_id) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_prof
  from public.professionals
  where profile_id = auth.uid()
    and practice_id = v_appt.practice_id;

  if not found then
    raise exception 'PROFESSIONAL_REQUIRED';
  end if;

  if v_prof.id is distinct from v_appt.professional_id then
    raise exception 'APPOINTMENT_PROFESSIONAL_MISMATCH';
  end if;

  if not public.can_read_clinical(
    v_appt.practice_id,
    v_appt.patient_id,
    v_appt.professional_id
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if v_appt.status in (
    'cancelled'::public.appointment_status,
    'no_show'::public.appointment_status,
    'completed'::public.appointment_status
  ) then
    raise exception 'APPOINTMENT_NOT_ATTENDABLE';
  end if;

  select e.id into v_existing
  from public.encounters e
  where e.appointment_id = v_appt.id;

  if v_existing is not null then
    return v_existing;
  end if;

  perform set_config('casa_florescer.allow_appointment_clinical_status', '1', true);

  if v_appt.status in (
    'scheduled'::public.appointment_status,
    'confirmed'::public.appointment_status
  ) then
    update public.appointments
       set status = 'checked_in'::public.appointment_status,
           checkin_at = coalesce(checkin_at, now()),
           checked_in_by = coalesce(checked_in_by, auth.uid())
     where id = v_appt.id;
  end if;

  insert into public.encounters (
    organization_id,
    practice_id,
    appointment_id,
    patient_id,
    professional_id,
    procedure_id,
    status
  ) values (
    v_appt.organization_id,
    v_appt.practice_id,
    v_appt.id,
    v_appt.patient_id,
    v_appt.professional_id,
    v_appt.procedure_id,
    'open'::public.encounter_status
  )
  returning id into v_enc_id;

  update public.appointments
     set status = 'in_progress'::public.appointment_status,
         actual_start_at = coalesce(actual_start_at, now()),
         actual_start_recorded_by = coalesce(actual_start_recorded_by, auth.uid())
   where id = v_appt.id;

  perform public.write_audit(
    'insert',
    'encounters',
    v_enc_id,
    v_appt.practice_id,
    v_appt.patient_id,
    jsonb_build_object(
      'appointment_id', v_appt.id,
      'rpc', 'encounter_open_from_appointment',
      'actual_start_recorded', true
    )
  );

  return v_enc_id;
end;
$$;

comment on function public.encounter_open_from_appointment(uuid) is
  'C1 + C032.1: abre encounter; promove agenda para in_progress; grava actual_start_at se nulo. Não grava actual_end_at.';

-- encounter_sign permanece sem preencher actual_end_at (assinatura ≠ término clínico).

-- ---------------------------------------------------------------------------
-- 5) RPC opcional: registrar chegada física (não é check-in)
-- ---------------------------------------------------------------------------

create or replace function public.appointment_record_arrival(
  p_appointment_id uuid,
  p_arrived_at timestamptz default now()
)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.appointments%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_row
  from public.appointments
  where id = p_appointment_id
  for update;

  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND';
  end if;

  if not public.can_schedule_in_org(v_row.organization_id, v_row.practice_id) then
    raise exception 'FORBIDDEN';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active
  ) then
    raise exception 'PROFILE_INACTIVE';
  end if;

  if v_row.status in (
    'cancelled'::public.appointment_status,
    'no_show'::public.appointment_status,
    'completed'::public.appointment_status
  ) then
    raise exception 'APPOINTMENT_NOT_ATTENDABLE';
  end if;

  if v_row.arrival_at is not null then
    return v_row;
  end if;

  update public.appointments
     set arrival_at = coalesce(p_arrived_at, now()),
         arrival_recorded_by = auth.uid()
   where id = v_row.id
  returning * into v_row;

  perform public.write_audit(
    'update',
    'appointments',
    v_row.id,
    v_row.practice_id,
    v_row.patient_id,
    jsonb_build_object(
      'rpc', 'appointment_record_arrival',
      'arrival_at', v_row.arrival_at
    )
  );

  return v_row;
end;
$$;

comment on function public.appointment_record_arrival(uuid, timestamptz) is
  'C032.1: registra chegada física (arrival_at). Não altera checkin_at nem status.';

revoke all on function public.appointment_record_arrival(uuid, timestamptz) from public;
revoke all on function public.appointment_record_arrival(uuid, timestamptz) from anon;
grant execute on function public.appointment_record_arrival(uuid, timestamptz) to authenticated;

-- Grants encounter_open já existentes; reafirmar execute.
revoke all on function public.encounter_open_from_appointment(uuid) from public;
revoke all on function public.encounter_open_from_appointment(uuid) from anon;
grant execute on function public.encounter_open_from_appointment(uuid) to authenticated;
