-- C031.1 — Edição segura de agendamento
-- 1) Conflito de profissional no banco (espelha appointments_room_no_overlap).
-- 2) RPC appointment_update: edita campos operacionais com guarda de status/encounter.
-- Não altera cancelamento, prontuário, obstetrícia, RLS de notes/encounters.

-- ---------------------------------------------------------------------------
-- 1) Exclusão de sobreposição por profissional
-- ---------------------------------------------------------------------------

alter table public.appointments
  drop constraint if exists appointments_professional_no_overlap;

alter table public.appointments
  add constraint appointments_professional_no_overlap
  exclude using gist (
    professional_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status not in ('cancelled', 'no_show'));

comment on constraint appointments_professional_no_overlap on public.appointments is
  'C031.1: impede a mesma profissional em dois agendamentos sobrepostos (intervalo semiaberto [)).';

-- ---------------------------------------------------------------------------
-- 1b) Guarda de UPDATE operacional (API direta ou RPC)
-- ---------------------------------------------------------------------------

create or replace function public.appointments_guard_operational_edit()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'UPDATE'
     and (
       new.patient_id,
       new.professional_id,
       new.room_id,
       new.procedure_id,
       new.kind,
       new.starts_at,
       new.ends_at,
       new.urgency_note,
       new.practice_id,
       new.organization_id,
       new.created_by,
       new.source
     ) is distinct from (
       old.patient_id,
       old.professional_id,
       old.room_id,
       old.procedure_id,
       old.kind,
       old.starts_at,
       old.ends_at,
       old.urgency_note,
       old.practice_id,
       old.organization_id,
       old.created_by,
       old.source
     )
  then
    if old.status not in (
      'scheduled'::public.appointment_status,
      'confirmed'::public.appointment_status
    ) then
      raise exception 'APPOINTMENT_NOT_EDITABLE';
    end if;

    if new.status is distinct from old.status then
      raise exception 'APPOINTMENT_UPDATE_STATUS_LOCKED';
    end if;

    if new.organization_id is distinct from old.organization_id
       or new.practice_id is distinct from old.practice_id
       or new.created_by is distinct from old.created_by
       or new.source is distinct from old.source then
      raise exception 'APPOINTMENT_UPDATE_SCOPE_LOCKED';
    end if;

    if exists (
      select 1 from public.encounters e where e.appointment_id = old.id
    ) then
      raise exception 'APPOINTMENT_HAS_ENCOUNTER';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.appointments_guard_operational_edit() is
  'C031.1: bloqueia edição operacional fora de scheduled/confirmed ou com encounter vinculado.';

drop trigger if exists appointments_guard_operational_edit on public.appointments;
create trigger appointments_guard_operational_edit
  before update on public.appointments
  for each row
  execute function public.appointments_guard_operational_edit();

-- ---------------------------------------------------------------------------
-- 2) RPC appointment_update
-- ---------------------------------------------------------------------------

create or replace function public.appointment_update(
  p_appointment_id uuid,
  p_patient_id uuid,
  p_professional_id uuid,
  p_room_id uuid,
  p_procedure_id uuid,
  p_kind public.appointment_kind,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_urgency_note text default null
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

  if p_appointment_id is null
     or p_patient_id is null
     or p_professional_id is null
     or p_room_id is null
     or p_procedure_id is null
     or p_kind is null
     or p_starts_at is null
     or p_ends_at is null then
    raise exception 'APPOINTMENT_UPDATE_INVALID';
  end if;

  if p_ends_at <= p_starts_at then
    raise exception 'APPOINTMENT_UPDATE_INVALID_RANGE';
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

  -- Edição operacional só antes do fluxo clínico (check-in / atendimento).
  if v_row.status not in (
    'scheduled'::public.appointment_status,
    'confirmed'::public.appointment_status
  ) then
    raise exception 'APPOINTMENT_NOT_EDITABLE';
  end if;

  -- Não divergir encounter existente (patient/professional/procedure).
  if exists (
    select 1 from public.encounters e where e.appointment_id = v_row.id
  ) then
    raise exception 'APPOINTMENT_HAS_ENCOUNTER';
  end if;

  begin
    update public.appointments
       set patient_id = p_patient_id,
           professional_id = p_professional_id,
           room_id = p_room_id,
           procedure_id = p_procedure_id,
           kind = p_kind,
           starts_at = p_starts_at,
           ends_at = p_ends_at,
           urgency_note = nullif(btrim(p_urgency_note), '')
     where id = v_row.id
    returning * into v_row;
  exception
    when exclusion_violation then
      if sqlerrm ilike '%appointments_professional_no_overlap%' then
        raise exception 'APPOINTMENT_PROFESSIONAL_OVERLAP';
      end if;
      if sqlerrm ilike '%appointments_room_no_overlap%' then
        raise exception 'APPOINTMENT_ROOM_OVERLAP';
      end if;
      raise;
  end;

  perform public.write_audit(
    'update'::public.audit_action,
    'appointments',
    v_row.id,
    v_row.practice_id,
    v_row.patient_id,
    jsonb_build_object(
      'rpc', 'appointment_update',
      'kind', v_row.kind,
      'status', v_row.status,
      'professional_id', v_row.professional_id,
      'room_id', v_row.room_id,
      'procedure_id', v_row.procedure_id,
      'starts_at', v_row.starts_at,
      'ends_at', v_row.ends_at
    )
  );

  return v_row;
end;
$$;

comment on function public.appointment_update(
  uuid, uuid, uuid, uuid, uuid, public.appointment_kind, timestamptz, timestamptz, text
) is
  'C031.1: edita agendamento scheduled/confirmed sem encounter; conflitos de sala/profissional no banco.';

revoke all on function public.appointment_update(
  uuid, uuid, uuid, uuid, uuid, public.appointment_kind, timestamptz, timestamptz, text
) from public;
revoke all on function public.appointment_update(
  uuid, uuid, uuid, uuid, uuid, public.appointment_kind, timestamptz, timestamptz, text
) from anon;
grant execute on function public.appointment_update(
  uuid, uuid, uuid, uuid, uuid, public.appointment_kind, timestamptz, timestamptz, text
) to authenticated;
