-- C039 — Portal: jornada da paciente (projeção sanitizada + notificações)
-- NÃO altera 0001–0039.
-- NÃO expõe prediction_reason / agenda_blocks / dados de terceiros.
-- NÃO ativa WhatsApp / Push / e-mail reais.

-- ---------------------------------------------------------------------------
-- 1) Limiar configurável de notificação de atraso (minutos)
-- Isolado para ajuste futuro pela Casa Florescer sem mudar a UI.
-- ---------------------------------------------------------------------------

create or replace function public.patient_schedule_notify_threshold_min()
returns integer
language sql
immutable
set search_path = public
as $$
  select 5;
$$;

comment on function public.patient_schedule_notify_threshold_min() is
  'C039: minutos mínimos de atraso/salto para notificar a paciente (in-app). Ajustar aqui.';

create or replace function public.patient_schedule_exceptional_delay_min()
returns integer
language sql
immutable
set search_path = public
as $$
  select 60;
$$;

comment on function public.patient_schedule_exceptional_delay_min() is
  'C039: atraso >= este valor usa mensagem operacional excepcional sanitizada (sem motivo interno).';

revoke all on function public.patient_schedule_notify_threshold_min() from public, anon;
revoke all on function public.patient_schedule_exceptional_delay_min() from public, anon;
grant execute on function public.patient_schedule_notify_threshold_min() to authenticated;
grant execute on function public.patient_schedule_exceptional_delay_min() to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Notificação sanitizada de alteração de horário (threshold + anti-spam)
-- ---------------------------------------------------------------------------

create or replace function public.patient_notify_schedule_update(
  p_appointment_id uuid,
  p_predicted_starts_at timestamptz,
  p_delay_minutes integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appt public.appointments%rowtype;
  v_user uuid;
  v_title text;
  v_message text;
  v_delay integer := greatest(coalesce(p_delay_minutes, 0), 0);
  v_threshold integer := public.patient_schedule_notify_threshold_min();
  v_exceptional integer := public.patient_schedule_exceptional_delay_min();
begin
  select * into v_appt from public.appointments where id = p_appointment_id;
  if not found then
    return;
  end if;

  select a.user_id into v_user
  from public.patient_accounts a
  where a.patient_id = v_appt.patient_id
  limit 1;

  if v_user is null then
    return;
  end if;

  -- Abaixo do limiar: só portal (sem notificação).
  if v_delay < v_threshold then
    return;
  end if;

  -- Anti-spam: mesma appointment + mesmo event nos últimos 20 minutos.
  if exists (
    select 1
    from public.patient_notifications n
    where n.patient_id = v_appt.patient_id
      and n.reference_type = 'appointment'
      and n.reference_id = v_appt.id
      and n.event_type = 'appointment_schedule_updated'
      and n.created_at > now() - interval '20 minutes'
  ) then
    return;
  end if;

  v_title := 'Horário estimado atualizado';
  if v_delay >= v_exceptional then
    v_message := format(
      'Identificamos uma alteração excepcional na agenda. Seu atendimento está previsto para aproximadamente %s. Você não precisa ligar: acompanhe atualizações por este aplicativo.',
      to_char(timezone('America/Sao_Paulo', p_predicted_starts_at), 'HH24:MI')
    );
  else
    v_message := format(
      'Sua previsão de atendimento foi atualizada. Novo horário estimado: %s (atraso aproximado de %s min). Você não precisa ligar: acompanhe por este aplicativo.',
      to_char(timezone('America/Sao_Paulo', p_predicted_starts_at), 'HH24:MI'),
      v_delay
    );
  end if;

  insert into public.patient_notifications (
    organization_id,
    practice_id,
    patient_id,
    recipient_user_id,
    event_type,
    title,
    message,
    reference_type,
    reference_id
  ) values (
    v_appt.organization_id,
    v_appt.practice_id,
    v_appt.patient_id,
    v_user,
    'appointment_schedule_updated',
    v_title,
    v_message,
    'appointment',
    v_appt.id
  );

  perform public.write_audit(
    'insert',
    'patient_notifications',
    v_appt.id,
    v_appt.practice_id,
    v_appt.patient_id,
    jsonb_build_object(
      'rpc', 'patient_notify_schedule_update',
      'event_type', 'appointment_schedule_updated',
      'delay_minutes', v_delay
    )
  );
end;
$$;

comment on function public.patient_notify_schedule_update(uuid, timestamptz, integer) is
  'C038/C039: notificação in-app sanitizada de alteração de horário. Sem prediction_reason.';

-- ---------------------------------------------------------------------------
-- 3) Notificação sanitizada início / término clínico
-- ---------------------------------------------------------------------------

create or replace function public.patient_notify_attendance_event(
  p_appointment_id uuid,
  p_event_type text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appt public.appointments%rowtype;
  v_user uuid;
  v_title text;
  v_message text;
begin
  if p_event_type not in ('appointment_attendance_started', 'appointment_attendance_ended') then
    return;
  end if;

  select * into v_appt from public.appointments where id = p_appointment_id;
  if not found then
    return;
  end if;

  select a.user_id into v_user
  from public.patient_accounts a
  where a.patient_id = v_appt.patient_id
  limit 1;

  if v_user is null then
    return;
  end if;

  if exists (
    select 1
    from public.patient_notifications n
    where n.patient_id = v_appt.patient_id
      and n.reference_type = 'appointment'
      and n.reference_id = v_appt.id
      and n.event_type = p_event_type
  ) then
    return;
  end if;

  if p_event_type = 'appointment_attendance_started' then
    v_title := 'Atendimento iniciado';
    v_message := 'Seu atendimento foi iniciado. Acompanhe novidades por este aplicativo.';
  else
    v_title := 'Atendimento concluído';
    v_message := 'Seu atendimento foi concluído. Orientações e documentos publicados aparecerão aqui.';
  end if;

  insert into public.patient_notifications (
    organization_id,
    practice_id,
    patient_id,
    recipient_user_id,
    event_type,
    title,
    message,
    reference_type,
    reference_id
  ) values (
    v_appt.organization_id,
    v_appt.practice_id,
    v_appt.patient_id,
    v_user,
    p_event_type,
    v_title,
    v_message,
    'appointment',
    v_appt.id
  );

  perform public.write_audit(
    'insert',
    'patient_notifications',
    v_appt.id,
    v_appt.practice_id,
    v_appt.patient_id,
    jsonb_build_object(
      'rpc', 'patient_notify_attendance_event',
      'event_type', p_event_type
    )
  );
end;
$$;

comment on function public.patient_notify_attendance_event(uuid, text) is
  'C039: notificação sanitizada de início/término clínico para a própria paciente.';

revoke all on function public.patient_notify_attendance_event(uuid, text) from public, anon, authenticated;

create or replace function public.appointments_notify_patient_temporal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.actual_start_at is null and new.actual_start_at is not null then
      perform public.patient_notify_attendance_event(new.id, 'appointment_attendance_started');
    end if;
    if old.actual_end_at is null and new.actual_end_at is not null then
      perform public.patient_notify_attendance_event(new.id, 'appointment_attendance_ended');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_notify_patient_temporal on public.appointments;
create trigger appointments_notify_patient_temporal
  after update of actual_start_at, actual_end_at on public.appointments
  for each row
  execute function public.appointments_notify_patient_temporal();

comment on function public.appointments_notify_patient_temporal() is
  'C039: dispara notificação sanitizada quando actual_start_at / actual_end_at são gravados.';

-- ---------------------------------------------------------------------------
-- 4) Predictions append: mesma lógica C038, limiar via função configurável
-- ---------------------------------------------------------------------------

create or replace function public.appointment_predictions_append(
  p_items jsonb
)
returns setof public.appointment_predictions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_appointment_id uuid;
  v_predicted_starts timestamptz;
  v_predicted_ends timestamptz;
  v_reason text;
  v_appt public.appointments%rowtype;
  v_next_version integer;
  v_row public.appointment_predictions%rowtype;
  v_prev_starts timestamptz;
  v_delay integer;
  v_prev_delay integer;
  v_threshold integer := public.patient_schedule_notify_threshold_min();
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'PREDICTION_ITEMS_INVALID';
  end if;

  if jsonb_array_length(p_items) = 0 then
    return;
  end if;

  if jsonb_array_length(p_items) > 200 then
    raise exception 'PREDICTION_ITEMS_TOO_MANY';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active
  ) then
    raise exception 'PROFILE_INACTIVE';
  end if;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    begin
      v_appointment_id := (v_item->>'appointment_id')::uuid;
      v_predicted_starts := (v_item->>'predicted_starts_at')::timestamptz;
      v_predicted_ends := (v_item->>'predicted_ends_at')::timestamptz;
    exception when others then
      raise exception 'PREDICTION_ITEM_INVALID';
    end;

    v_reason := nullif(btrim(coalesce(v_item->>'prediction_reason', '')), '');

    if v_appointment_id is null
       or v_predicted_starts is null
       or v_predicted_ends is null then
      raise exception 'PREDICTION_ITEM_INVALID';
    end if;

    if v_predicted_ends <= v_predicted_starts then
      raise exception 'PREDICTION_RANGE_INVALID';
    end if;

    select * into v_appt
    from public.appointments
    where id = v_appointment_id
    for share;

    if not found then
      raise exception 'APPOINTMENT_NOT_FOUND';
    end if;

    if not public.can_schedule_in_org(v_appt.organization_id, v_appt.practice_id) then
      raise exception 'FORBIDDEN';
    end if;

    if exists (
      select 1
      from public.appointment_predictions ap
      where ap.appointment_id = v_appointment_id
        and ap.prediction_version = (
          select max(x.prediction_version)
          from public.appointment_predictions x
          where x.appointment_id = v_appointment_id
        )
        and ap.predicted_starts_at = v_predicted_starts
        and ap.predicted_ends_at = v_predicted_ends
        and ap.prediction_reason is not distinct from v_reason
    ) then
      continue;
    end if;

    select ap.predicted_starts_at
      into v_prev_starts
    from public.appointment_predictions ap
    where ap.appointment_id = v_appointment_id
    order by ap.prediction_version desc
    limit 1;

    select coalesce(max(prediction_version), 0) + 1
      into v_next_version
    from public.appointment_predictions
    where appointment_id = v_appointment_id;

    insert into public.appointment_predictions (
      appointment_id,
      organization_id,
      practice_id,
      prediction_version,
      predicted_starts_at,
      predicted_ends_at,
      prediction_reason,
      calculated_at,
      created_by
    ) values (
      v_appt.id,
      v_appt.organization_id,
      v_appt.practice_id,
      v_next_version,
      v_predicted_starts,
      v_predicted_ends,
      v_reason,
      now(),
      auth.uid()
    )
    returning * into v_row;

    v_delay := greatest(
      0,
      floor(extract(epoch from (v_predicted_starts - v_appt.scheduled_starts_at)) / 60.0)::int
    );
    v_prev_delay := case
      when v_prev_starts is null then null
      else greatest(
        0,
        floor(extract(epoch from (v_prev_starts - v_appt.scheduled_starts_at)) / 60.0)::int
      )
    end;

    if v_appt.status not in (
         'cancelled'::public.appointment_status,
         'no_show'::public.appointment_status,
         'completed'::public.appointment_status
       )
       and (
         v_delay >= v_threshold
         or (
           v_prev_delay is not null
           and abs(v_delay - v_prev_delay) >= v_threshold
         )
       )
    then
      perform public.patient_notify_schedule_update(
        v_appt.id,
        v_predicted_starts,
        v_delay
      );
    end if;

    return next v_row;
  end loop;

  return;
end;
$$;

comment on function public.appointment_predictions_append(jsonb) is
  'C032.2/C038/C039: append versionado + notificação sanitizada quando alteração >= limiar configurável.';

revoke all on function public.appointment_predictions_append(jsonb) from public, anon;
grant execute on function public.appointment_predictions_append(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Projeção sanitizada ampliada (jornada)
-- ---------------------------------------------------------------------------

create or replace function public.patient_portal_my_appointments(
  p_limit integer default 40
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patient uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 40), 1), 100);
  v_rows jsonb;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select a.patient_id into v_patient
  from public.patient_accounts a
  where a.user_id = auth.uid()
  limit 1;

  if v_patient is null then
    raise exception 'FORBIDDEN';
  end if;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.sort_at), '[]'::jsonb)
    into v_rows
  from (
    select
      a.id as appointment_id,
      a.organization_id,
      a.practice_id,
      a.scheduled_starts_at,
      a.scheduled_ends_at,
      a.status::text as status,
      coalesce(nullif(btrim(pf.full_name), ''), 'Profissional') as professional_name,
      coalesce(nullif(btrim(proc.name), ''), a.kind::text) as procedure_label,
      r.name as room_name,
      pred.predicted_starts_at,
      pred.predicted_ends_at,
      pred.prediction_updated_at,
      case
        when pred.predicted_starts_at is null then null
        else greatest(
          0,
          floor(extract(epoch from (pred.predicted_starts_at - a.scheduled_starts_at)) / 60.0)::int
        )
      end as delay_minutes,
      case
        when pred.predicted_starts_at is null then false
        else pred.predicted_starts_at < a.scheduled_starts_at
      end as is_earlier,
      (pred.predicted_starts_at is not null) as has_prediction,
      (a.arrival_at is not null) as has_arrived,
      a.actual_start_at,
      a.actual_end_at,
      case
        when a.status = 'cancelled'::public.appointment_status then 'cancelled'
        when a.status = 'no_show'::public.appointment_status then 'no_show'
        when a.actual_end_at is not null or a.status = 'completed'::public.appointment_status then 'completed'
        when a.actual_start_at is not null or a.status = 'in_progress'::public.appointment_status then 'in_progress'
        when a.arrival_at is not null or a.status = 'checked_in'::public.appointment_status then 'waiting'
        when pred.predicted_starts_at is not null
             and pred.predicted_starts_at > a.scheduled_starts_at
             and floor(extract(epoch from (pred.predicted_starts_at - a.scheduled_starts_at)) / 60.0) >= public.patient_schedule_notify_threshold_min()
          then 'delayed'
        else 'scheduled'
      end as journey_status,
      a.scheduled_starts_at as sort_at
    from public.appointments a
    left join public.professionals pr on pr.id = a.professional_id
    left join public.profiles pf on pf.id = pr.profile_id
    left join public.rooms r on r.id = a.room_id
    left join public.procedures proc on proc.id = a.procedure_id
    left join lateral (
      select
        ap.predicted_starts_at,
        ap.predicted_ends_at,
        ap.calculated_at as prediction_updated_at
      from public.appointment_predictions ap
      where ap.appointment_id = a.id
      order by ap.prediction_version desc
      limit 1
    ) pred on true
    where a.patient_id = v_patient
      and public.is_patient_self(a.patient_id)
    order by a.scheduled_starts_at desc
    limit v_limit
  ) x;

  return jsonb_build_object(
    'patient_id', v_patient,
    'appointments', coalesce(v_rows, '[]'::jsonb),
    'notify_threshold_min', public.patient_schedule_notify_threshold_min()
  );
end;
$$;

comment on function public.patient_portal_my_appointments(integer) is
  'C038/C039: projeção sanitizada da jornada da paciente. Sem prediction_reason, sem terceiros, sem agenda_blocks.';

revoke all on function public.patient_portal_my_appointments(integer) from public, anon;
grant execute on function public.patient_portal_my_appointments(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Marcar notificação como lida
-- ---------------------------------------------------------------------------

create or replace function public.patient_notification_mark_read(
  p_notification_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.patient_notifications%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_row
  from public.patient_notifications
  where id = p_notification_id
  for update;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  if v_row.recipient_user_id <> auth.uid() then
    raise exception 'FORBIDDEN';
  end if;

  if v_row.read_at is not null then
    return;
  end if;

  update public.patient_notifications
     set read_at = now()
   where id = v_row.id;

  perform public.write_audit(
    'update',
    'patient_notifications',
    v_row.id,
    v_row.practice_id,
    v_row.patient_id,
    jsonb_build_object('rpc', 'patient_notification_mark_read')
  );
end;
$$;

comment on function public.patient_notification_mark_read(uuid) is
  'C039: marca notificação in-app como lida (somente destinatário).';

revoke all on function public.patient_notification_mark_read(uuid) from public, anon;
grant execute on function public.patient_notification_mark_read(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Chegada pela própria paciente (portal)
-- ---------------------------------------------------------------------------

create or replace function public.patient_portal_record_arrival(
  p_appointment_id uuid
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

  if not public.is_patient_self(v_row.patient_id) then
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
     set arrival_at = now(),
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
      'rpc', 'patient_portal_record_arrival',
      'arrival_at', v_row.arrival_at
    )
  );

  return v_row;
end;
$$;

comment on function public.patient_portal_record_arrival(uuid) is
  'C039: paciente registra chegada física no próprio appointment. Idempotente. Sem alterar status/check-in.';

revoke all on function public.patient_portal_record_arrival(uuid) from public, anon;
grant execute on function public.patient_portal_record_arrival(uuid) to authenticated;

-- Reafirmar: paciente sem SELECT em predictions brutas.
drop policy if exists appointment_predictions_patient_select
  on public.appointment_predictions;
