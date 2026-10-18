-- C055 — Retorno do atendimento
-- Vínculo formal: encounter de retorno → encounter de origem.
-- NÃO altera RLS de leitura/escrita clínica.
-- NÃO altera semântica de assinatura / actual_end / starts_at.
-- Aplicar somente com autorização expressa (db push).

-- ---------------------------------------------------------------------------
-- 1) Coluna de vínculo
-- ---------------------------------------------------------------------------

alter table public.encounters
  add column if not exists return_of_encounter_id uuid;

comment on column public.encounters.return_of_encounter_id is
  'C055: encounter de origem deste retorno. NULL = consulta/atendimento sem vínculo de retorno.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'encounters_return_of_encounter_id_fkey'
  ) then
    alter table public.encounters
      add constraint encounters_return_of_encounter_id_fkey
      foreign key (return_of_encounter_id)
      references public.encounters (id)
      on delete restrict;
  end if;
end $$;

alter table public.encounters
  drop constraint if exists encounters_return_of_not_self;

alter table public.encounters
  add constraint encounters_return_of_not_self
  check (
    return_of_encounter_id is null
    or return_of_encounter_id is distinct from id
  );

create index if not exists encounters_return_of_idx
  on public.encounters (return_of_encounter_id)
  where return_of_encounter_id is not null;

comment on index public.encounters_return_of_idx is
  'C055: localiza retornos a partir do encounter de origem.';

-- ---------------------------------------------------------------------------
-- 2) Guard: vínculo imutável após definido / assinado
-- ---------------------------------------------------------------------------

create or replace function public.encounters_return_of_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src public.encounters%rowtype;
begin
  if TG_OP = 'UPDATE'
     and new.return_of_encounter_id is distinct from old.return_of_encounter_id then
    if old.status = 'signed'::public.encounter_status
       or new.status = 'signed'::public.encounter_status then
      raise exception 'ENCOUNTER_SIGNED_RETURN_LOCKED';
    end if;
    if old.return_of_encounter_id is not null then
      raise exception 'RETURN_OF_IMMUTABLE';
    end if;
  end if;

  if new.return_of_encounter_id is not null
     and (
       TG_OP = 'INSERT'
       or (
         TG_OP = 'UPDATE'
         and new.return_of_encounter_id is distinct from old.return_of_encounter_id
       )
     ) then
    select * into v_src
    from public.encounters
    where id = new.return_of_encounter_id;

    if not found then
      raise exception 'RETURN_SOURCE_NOT_FOUND';
    end if;

    if v_src.patient_id is distinct from new.patient_id
       or v_src.practice_id is distinct from new.practice_id
       or v_src.organization_id is distinct from new.organization_id then
      raise exception 'RETURN_SOURCE_SCOPE_MISMATCH';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.encounters_return_of_guard() is
  'C055: valida escopo do retorno e impede alteração do vínculo após definido/assinado.';

drop trigger if exists encounters_return_of_guard on public.encounters;
create trigger encounters_return_of_guard
  before insert or update of return_of_encounter_id, status
  on public.encounters
  for each row execute function public.encounters_return_of_guard();

-- ---------------------------------------------------------------------------
-- 3) RPC: abrir retorno (agora ou a partir de agendamento)
-- ---------------------------------------------------------------------------

create or replace function public.encounter_open_return(
  p_source_encounter_id uuid,
  p_appointment_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src public.encounters%rowtype;
  v_appt public.appointments%rowtype;
  v_prof public.professionals%rowtype;
  v_enc_id uuid;
  v_existing uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_source_encounter_id is null then
    raise exception 'RETURN_SOURCE_REQUIRED';
  end if;

  select * into v_src
  from public.encounters
  where id = p_source_encounter_id
  for update;

  if not found then
    raise exception 'RETURN_SOURCE_NOT_FOUND';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active
  ) then
    raise exception 'PROFILE_INACTIVE';
  end if;

  if not public.can_write_clinical(v_src.practice_id) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_prof
  from public.professionals
  where profile_id = auth.uid()
    and practice_id = v_src.practice_id;

  if not found then
    raise exception 'PROFESSIONAL_REQUIRED';
  end if;

  if not public.can_read_clinical(
    v_src.practice_id,
    v_src.patient_id,
    v_prof.id
  ) then
    raise exception 'FORBIDDEN';
  end if;

  -- Idempotência (retorno imediato): open do mesmo profissional + mesma origem
  if p_appointment_id is null then
    select e.id into v_existing
    from public.encounters e
    where e.return_of_encounter_id = v_src.id
      and e.professional_id = v_prof.id
      and e.status = 'open'::public.encounter_status
    order by e.created_at desc
    limit 1;

    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  if p_appointment_id is not null then
    select * into v_appt
    from public.appointments
    where id = p_appointment_id
    for update;

    if not found then
      raise exception 'APPOINTMENT_NOT_FOUND';
    end if;

    if v_appt.practice_id is distinct from v_src.practice_id
       or v_appt.patient_id is distinct from v_src.patient_id then
      raise exception 'RETURN_APPOINTMENT_SCOPE_MISMATCH';
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
      -- Anexa origem se ainda nula (agendamento aberto sem vínculo)
      update public.encounters
         set return_of_encounter_id = coalesce(return_of_encounter_id, v_src.id)
       where id = v_existing
         and status = 'open'::public.encounter_status
         and return_of_encounter_id is null;

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
      status,
      return_of_encounter_id
    ) values (
      v_appt.organization_id,
      v_appt.practice_id,
      v_appt.id,
      v_appt.patient_id,
      v_appt.professional_id,
      v_appt.procedure_id,
      'open'::public.encounter_status,
      v_src.id
    )
    returning id into v_enc_id;

    update public.appointments
       set status = 'in_progress'::public.appointment_status,
           actual_start_at = coalesce(actual_start_at, now()),
           actual_start_recorded_by = coalesce(actual_start_recorded_by, auth.uid())
     where id = v_appt.id;
  else
    -- Retorno imediato sem agendamento
    insert into public.encounters (
      organization_id,
      practice_id,
      appointment_id,
      patient_id,
      professional_id,
      procedure_id,
      status,
      return_of_encounter_id
    ) values (
      v_src.organization_id,
      v_src.practice_id,
      null,
      v_src.patient_id,
      v_prof.id,
      v_src.procedure_id,
      'open'::public.encounter_status,
      v_src.id
    )
    returning id into v_enc_id;
  end if;

  perform public.write_audit(
    'insert',
    'encounters',
    v_enc_id,
    v_src.practice_id,
    v_src.patient_id,
    jsonb_build_object(
      'rpc', 'encounter_open_return',
      'return_of_encounter_id', v_src.id,
      'appointment_id', p_appointment_id
    )
  );

  return v_enc_id;
end;
$$;

comment on function public.encounter_open_return(uuid, uuid) is
  'C055: abre novo encounter de retorno vinculado à origem; idempotente para open do mesmo profissional.';

revoke all on function public.encounter_open_return(uuid, uuid) from public;
revoke all on function public.encounter_open_return(uuid, uuid) from anon;
grant execute on function public.encounter_open_return(uuid, uuid) to authenticated;
