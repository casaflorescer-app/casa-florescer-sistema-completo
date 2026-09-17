-- FASE C1 / Migration C1_001 — MVP Atendimento Assistencial
--
-- Escopo:
--   Agenda operacional + Encounter + Nota clinica assinavel.
--   RPCs de transicao de estado; policy UPDATE em clinical_notes;
--   revoga god-mode SA em appointments (alinhado a 0016 / B3.3).
--   C1.4: unique notes + ON CONFLICT; trava encounter assinado;
--         status clinico de agenda so via RPC (GUC local).
--
-- NAO inclui:
--   encounters.pregnancy_id (C1.1);
--   clinical_procedures GYN;
--   alteracao A/B1/B2 (pregnancies / payouts / care policies).
--
-- Principios:
--   SECURITY DEFINER + search_path = public;
--   mutacao sensivel via RPC;
--   revoke public/anon; grant authenticated;
--   SYSTEM_ADMIN nao recebe clinica automatica.

-- ---------------------------------------------------------------------------
-- 0) GUC local: RPCs de encounter liberam status clinico na agenda
-- ---------------------------------------------------------------------------
-- current_setting('casa_florescer.allow_appointment_clinical_status', true)
-- = '1' somente dentro da transacao das RPCs encounter_open / encounter_sign.

-- ---------------------------------------------------------------------------
-- 1) clinical_notes: trava em encounter assinado (trigger)
-- ---------------------------------------------------------------------------

create or replace function public.clinical_notes_before_write()
returns trigger
language plpgsql
as $$
declare
  v_enc public.encounters%rowtype;
begin
  select * into v_enc from public.encounters where id = new.encounter_id;
  if v_enc.id is null then
    raise exception 'Nota clinica sem encounter.';
  end if;
  if v_enc.status is distinct from 'open' then
    raise exception 'Nota clinica bloqueada: encounter nao esta open.';
  end if;
  if new.practice_id is null then
    new.practice_id := v_enc.practice_id;
  end if;
  new.organization_id := public.resolve_org_from_practice(new.practice_id, new.organization_id);
  if new.practice_id is distinct from v_enc.practice_id
     or new.organization_id is distinct from v_enc.organization_id then
    raise exception 'Nota clinica fora do escopo do encounter.';
  end if;
  return new;
end;
$$;

comment on function public.clinical_notes_before_write() is
  'C1: sincroniza org/pratica com o encounter e bloqueia escrita se status <> open.';

-- Unique seguro: NULLS NOT DISTINCT trata template_code NULL como igual
-- (preserva coluna nullable; impede duplicata encounter+template).
drop index if exists public.clinical_notes_encounter_idx;
create unique index if not exists clinical_notes_encounter_template_uidx
  on public.clinical_notes (encounter_id, template_code)
  nulls not distinct;

comment on index public.clinical_notes_encounter_template_uidx is
  'C1.4: no maximo uma nota por encounter + template_code (NULL contabiliza).';

-- ---------------------------------------------------------------------------
-- 2) Policy UPDATE clinical_notes (somente encounter open)
-- ---------------------------------------------------------------------------

drop policy if exists clinical_notes_update on public.clinical_notes;

create policy clinical_notes_update on public.clinical_notes
  for update
  using (
    public.can_write_clinical(practice_id)
    and exists (
      select 1
      from public.encounters e
      where e.id = clinical_notes.encounter_id
        and e.status = 'open'::public.encounter_status
    )
  )
  with check (
    public.can_write_clinical(practice_id)
    and exists (
      select 1
      from public.encounters e
      where e.id = clinical_notes.encounter_id
        and e.status = 'open'::public.encounter_status
    )
  );

comment on policy clinical_notes_update on public.clinical_notes is
  'C1: medica pode atualizar nota apenas enquanto o encounter estiver open.';

-- ---------------------------------------------------------------------------
-- 3) Revogar god-mode SYSTEM_ADMIN em appointments (B3.3 / 0016)
-- ---------------------------------------------------------------------------

drop policy if exists appointments_system_admin on public.appointments;

comment on table public.appointments is
  'Agenda operacional. Acesso via can_schedule_in_org / patient self. SYSTEM_ADMIN nao tem FOR ALL clinico (C1 / B3.3). Status in_progress/completed somente via RPC de encounter (GUC).';

-- ---------------------------------------------------------------------------
-- 3b) appointments_before_write: trava status clinico fora da RPC
-- ---------------------------------------------------------------------------

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
  v_allow text;
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

  -- C1.4: in_progress / completed somente com GUC setado pelas RPCs de encounter.
  -- Secretaria continua livre para scheduled/confirmed/checked_in/cancelled/no_show
  -- (via UPDATE direto RLS ou appointment_set_status).
  if TG_OP = 'INSERT' then
    if new.status in (
      'in_progress'::public.appointment_status,
      'completed'::public.appointment_status
    ) then
      v_allow := current_setting('casa_florescer.allow_appointment_clinical_status', true);
      if v_allow is distinct from '1' then
        raise exception 'APPOINTMENT_STATUS_VIA_ENCOUNTER_RPC';
      end if;
    end if;
  elsif TG_OP = 'UPDATE' then
    if new.status is distinct from old.status
       and new.status in (
         'in_progress'::public.appointment_status,
         'completed'::public.appointment_status
       ) then
      v_allow := current_setting('casa_florescer.allow_appointment_clinical_status', true);
      if v_allow is distinct from '1' then
        raise exception 'APPOINTMENT_STATUS_VIA_ENCOUNTER_RPC';
      end if;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.appointments_before_write() is
  'C1.4: valida escopo da agenda; status in_progress/completed exige GUC das RPCs de encounter.';

-- ---------------------------------------------------------------------------
-- 3c) encounters_before_write: trava pos-assinatura
-- ---------------------------------------------------------------------------

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

  -- C1.4: encounter assinado nao reabre; identidade imutavel apos sign
  if TG_OP = 'UPDATE'
     and old.status = 'signed'::public.encounter_status then
    if new.status = 'open'::public.encounter_status then
      raise exception 'ENCOUNTER_SIGNED_LOCKED';
    end if;
    if new.patient_id is distinct from old.patient_id
       or new.practice_id is distinct from old.practice_id
       or new.professional_id is distinct from old.professional_id then
      raise exception 'ENCOUNTER_SIGNED_IDENTITY_LOCKED';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.encounters_before_write() is
  'C1.4: escopo encounter + bloqueio signed→open e mutacao de patient/practice/professional apos assinatura.';

-- ---------------------------------------------------------------------------
-- 4) RPC: appointment_set_status
-- ---------------------------------------------------------------------------

create or replace function public.appointment_set_status(
  p_appointment_id uuid,
  p_status public.appointment_status
)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.appointments%rowtype;
  v_old public.appointment_status;
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

  v_old := v_row.status;

  if v_old = p_status then
    return v_row;
  end if;

  -- Terminais: nao reabrir no C1
  if v_old in (
    'completed'::public.appointment_status,
    'cancelled'::public.appointment_status,
    'no_show'::public.appointment_status
  ) then
    raise exception 'APPOINTMENT_TERMINAL';
  end if;

  -- Transicoes permitidas (secretaria / staff agenda)
  if p_status = 'confirmed'::public.appointment_status then
    if v_old not in (
      'scheduled'::public.appointment_status,
      'checked_in'::public.appointment_status
    ) then
      raise exception 'INVALID_STATUS_TRANSITION';
    end if;
  elsif p_status = 'scheduled'::public.appointment_status then
    if v_old is distinct from 'confirmed'::public.appointment_status then
      raise exception 'INVALID_STATUS_TRANSITION';
    end if;
  elsif p_status = 'checked_in'::public.appointment_status then
    if v_old not in (
      'scheduled'::public.appointment_status,
      'confirmed'::public.appointment_status
    ) then
      raise exception 'INVALID_STATUS_TRANSITION';
    end if;
  elsif p_status = 'cancelled'::public.appointment_status then
    if v_old not in (
      'scheduled'::public.appointment_status,
      'confirmed'::public.appointment_status,
      'checked_in'::public.appointment_status
    ) then
      raise exception 'INVALID_STATUS_TRANSITION';
    end if;
  elsif p_status = 'no_show'::public.appointment_status then
    if v_old not in (
      'scheduled'::public.appointment_status,
      'confirmed'::public.appointment_status,
      'checked_in'::public.appointment_status
    ) then
      raise exception 'INVALID_STATUS_TRANSITION';
    end if;
  elsif p_status in (
    'in_progress'::public.appointment_status,
    'completed'::public.appointment_status
  ) then
    -- in_progress / completed: somente via encounter_open / encounter_sign
    raise exception 'STATUS_VIA_ENCOUNTER_RPC';
  else
    raise exception 'INVALID_STATUS';
  end if;

  update public.appointments
     set status = p_status,
         checkin_at = case
           when p_status = 'checked_in'::public.appointment_status then coalesce(checkin_at, now())
           when p_status in (
             'scheduled'::public.appointment_status,
             'confirmed'::public.appointment_status,
             'cancelled'::public.appointment_status,
             'no_show'::public.appointment_status
           ) and v_old = 'checked_in'::public.appointment_status
             then null
           else checkin_at
         end,
         checked_in_by = case
           when p_status = 'checked_in'::public.appointment_status then auth.uid()
           when p_status in (
             'scheduled'::public.appointment_status,
             'confirmed'::public.appointment_status,
             'cancelled'::public.appointment_status,
             'no_show'::public.appointment_status
           ) and v_old = 'checked_in'::public.appointment_status
             then null
           else checked_in_by
         end
   where id = v_row.id
   returning * into v_row;

  perform public.write_audit(
    'update',
    'appointments',
    v_row.id,
    v_row.practice_id,
    v_row.patient_id,
    jsonb_build_object(
      'from_status', v_old,
      'to_status', v_row.status,
      'rpc', 'appointment_set_status'
    )
  );

  return v_row;
end;
$$;

comment on function public.appointment_set_status(uuid, public.appointment_status) is
  'C1: transicao de status de agenda (confirm/check-in/cancel/no-show). in_progress/completed somente via RPCs de encounter.';

-- ---------------------------------------------------------------------------
-- 5) RPC: encounter_open_from_appointment
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

  -- Medica do dia = profissional do appointment (C1)
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

  -- GUC local: permite in_progress (e checked_in intermediario nao precisa)
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
     set status = 'in_progress'::public.appointment_status
   where id = v_appt.id;

  perform public.write_audit(
    'insert',
    'encounters',
    v_enc_id,
    v_appt.practice_id,
    v_appt.patient_id,
    jsonb_build_object(
      'appointment_id', v_appt.id,
      'rpc', 'encounter_open_from_appointment'
    )
  );

  return v_enc_id;
end;
$$;

comment on function public.encounter_open_from_appointment(uuid) is
  'C1: medica abre encounter 1:1 a partir do appointment; promove agenda para in_progress.';

-- ---------------------------------------------------------------------------
-- 6) RPC: clinical_note_upsert (ON CONFLICT)
-- ---------------------------------------------------------------------------

create or replace function public.clinical_note_upsert(
  p_encounter_id uuid,
  p_body text,
  p_template_code text default 'soap_min'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc public.encounters%rowtype;
  v_id uuid;
  v_version integer;
  v_body text;
  v_template text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  v_body := trim(coalesce(p_body, ''));
  if char_length(v_body) < 1 then
    raise exception 'NOTE_BODY_REQUIRED';
  end if;

  -- MVP: default soap_min; NULL/blank → default (coluna continua nullable no schema)
  v_template := nullif(trim(coalesce(p_template_code, '')), '');
  if v_template is null then
    v_template := 'soap_min';
  end if;

  select * into v_enc
  from public.encounters
  where id = p_encounter_id
  for share;

  if not found then
    raise exception 'ENCOUNTER_NOT_FOUND';
  end if;

  if v_enc.status is distinct from 'open'::public.encounter_status then
    raise exception 'ENCOUNTER_NOT_OPEN';
  end if;

  if not public.can_write_clinical(v_enc.practice_id) then
    raise exception 'FORBIDDEN';
  end if;

  if not exists (
    select 1
    from public.professionals pr
    where pr.id = v_enc.professional_id
      and pr.profile_id = auth.uid()
      and pr.practice_id = v_enc.practice_id
  ) then
    raise exception 'ENCOUNTER_OWNER_REQUIRED';
  end if;

  if not public.can_read_clinical(
    v_enc.practice_id,
    v_enc.patient_id,
    v_enc.professional_id
  ) then
    raise exception 'FORBIDDEN';
  end if;

  insert into public.clinical_notes (
    encounter_id,
    organization_id,
    practice_id,
    body_ciphertext,
    template_code,
    version,
    created_by
  ) values (
    v_enc.id,
    v_enc.organization_id,
    v_enc.practice_id,
    v_body,
    v_template,
    1,
    auth.uid()
  )
  on conflict (encounter_id, template_code) do update
    set body_ciphertext = excluded.body_ciphertext,
        version = public.clinical_notes.version + 1
  returning id, version into v_id, v_version;

  perform public.write_audit(
    case when v_version = 1 then 'insert'::public.audit_action else 'update'::public.audit_action end,
    'clinical_notes',
    v_id,
    v_enc.practice_id,
    v_enc.patient_id,
    jsonb_build_object(
      'encounter_id', v_enc.id,
      'template_code', v_template,
      'version', v_version,
      'rpc', 'clinical_note_upsert'
    )
  );

  return v_id;
end;
$$;

comment on function public.clinical_note_upsert(uuid, text, text) is
  'C1.4: upsert atomico via ON CONFLICT (encounter_id, template_code). Somente encounter open e medica dona.';

comment on column public.clinical_notes.body_ciphertext is
  'Payload clinico. C1 MVP: texto/JSON UTF-8 opaco; camada de cifragem dedicada fica para fase futura.';

-- ---------------------------------------------------------------------------
-- 7) RPC: encounter_sign
-- ---------------------------------------------------------------------------

create or replace function public.encounter_sign(
  p_encounter_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc public.encounters%rowtype;
  v_notes int;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_enc
  from public.encounters
  where id = p_encounter_id
  for update;

  if not found then
    raise exception 'ENCOUNTER_NOT_FOUND';
  end if;

  if v_enc.status = 'signed'::public.encounter_status then
    return v_enc.id;
  end if;

  if v_enc.status is distinct from 'open'::public.encounter_status then
    raise exception 'ENCOUNTER_NOT_OPEN';
  end if;

  if not public.can_write_clinical(v_enc.practice_id) then
    raise exception 'FORBIDDEN';
  end if;

  if not exists (
    select 1
    from public.professionals pr
    where pr.id = v_enc.professional_id
      and pr.profile_id = auth.uid()
      and pr.practice_id = v_enc.practice_id
  ) then
    raise exception 'ENCOUNTER_OWNER_REQUIRED';
  end if;

  select count(*)::int into v_notes
  from public.clinical_notes
  where encounter_id = v_enc.id;

  if coalesce(v_notes, 0) < 1 then
    raise exception 'NOTE_REQUIRED_BEFORE_SIGN';
  end if;

  update public.encounters
     set status = 'signed'::public.encounter_status,
         signed_at = now(),
         signed_by = auth.uid()
   where id = v_enc.id
   returning * into v_enc;

  if v_enc.appointment_id is not null then
    perform set_config('casa_florescer.allow_appointment_clinical_status', '1', true);

    update public.appointments
       set status = 'completed'::public.appointment_status
     where id = v_enc.appointment_id
       and status is distinct from 'cancelled'::public.appointment_status
       and status is distinct from 'no_show'::public.appointment_status;
  end if;

  -- audit 'sign' via trigger encounters_after_sign (0001)
  return v_enc.id;
end;
$$;

comment on function public.encounter_sign(uuid) is
  'C1: assina encounter open (exige ao menos uma nota), completa appointment vinculado via GUC.';

-- ---------------------------------------------------------------------------
-- 8) Grants / revokes (padrao 0017)
-- ---------------------------------------------------------------------------

revoke all on function public.appointment_set_status(uuid, public.appointment_status) from public;
revoke all on function public.appointment_set_status(uuid, public.appointment_status) from anon;
grant execute on function public.appointment_set_status(uuid, public.appointment_status) to authenticated;

revoke all on function public.encounter_open_from_appointment(uuid) from public;
revoke all on function public.encounter_open_from_appointment(uuid) from anon;
grant execute on function public.encounter_open_from_appointment(uuid) to authenticated;

revoke all on function public.clinical_note_upsert(uuid, text, text) from public;
revoke all on function public.clinical_note_upsert(uuid, text, text) from anon;
grant execute on function public.clinical_note_upsert(uuid, text, text) to authenticated;

revoke all on function public.encounter_sign(uuid) from public;
revoke all on function public.encounter_sign(uuid) from anon;
grant execute on function public.encounter_sign(uuid) to authenticated;

-- Triggers before_write: sem grant extra (invoker, nao chamaveis pelo client).
-- Policies clinical_notes_select/insert e appointments_staff preservadas.
-- clinical_notes_update (sec. 2) cobre UPDATE RLS; mutacao preferencial via RPC DEFINER.
