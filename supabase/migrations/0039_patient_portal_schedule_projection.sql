-- C038 — Portal operacional da paciente + previsão sanitizada + término clínico
-- NÃO altera 0001–0038.
-- NÃO cria policy patient SELECT em appointment_predictions.
-- NÃO sobrescreve starts_at / ends_at / scheduled_*.

-- ---------------------------------------------------------------------------
-- 1) Encerrar atendimento (actual_end_at) — explícito; ≠ assinatura SOAP
-- ---------------------------------------------------------------------------

create or replace function public.appointment_record_actual_end(
  p_appointment_id uuid,
  p_ended_at timestamptz default now()
)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.appointments%rowtype;
  v_ended timestamptz := coalesce(p_ended_at, now());
  v_duration_min integer;
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

  if not public.can_write_clinical(v_row.practice_id) then
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
    'no_show'::public.appointment_status
  ) then
    raise exception 'APPOINTMENT_NOT_ATTENDABLE';
  end if;

  -- Idempotente: já encerrado → retorna sem efeitos laterais.
  if v_row.actual_end_at is not null then
    return v_row;
  end if;

  -- Término clínico exige início clínico prévio (assinatura SOAP ≠ término).
  if v_row.actual_start_at is null then
    raise exception 'APPOINTMENT_ACTUAL_END_WITHOUT_START';
  end if;

  if v_ended < v_row.actual_start_at then
    raise exception 'APPOINTMENT_ACTUAL_END_BEFORE_START';
  end if;

  update public.appointments
     set actual_end_at = v_ended,
         actual_end_recorded_by = auth.uid()
   where id = v_row.id
  returning * into v_row;

  v_duration_min := greatest(
    0,
    floor(extract(epoch from (v_row.actual_end_at - v_row.actual_start_at)) / 60.0)::int
  );

  perform public.write_audit(
    'update',
    'appointments',
    v_row.id,
    v_row.practice_id,
    v_row.patient_id,
    jsonb_build_object(
      'rpc', 'appointment_record_actual_end',
      'actual_start_at', v_row.actual_start_at,
      'actual_end_at', v_row.actual_end_at,
      'effective_duration_min', v_duration_min
    )
  );

  return v_row;
end;
$$;

comment on function public.appointment_record_actual_end(uuid, timestamptz) is
  'C038: registra término clínico efetivo (actual_end_at). Não assina SOAP. Não altera scheduled_*/starts_at.';

revoke all on function public.appointment_record_actual_end(uuid, timestamptz) from public, anon;
grant execute on function public.appointment_record_actual_end(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Notificação sanitizada de alteração de horário (in-app)
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

  -- Anti-spam: mesma appointment nos últimos 20 minutos.
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
  if v_delay >= 5 then
    v_message := format(
      'Sua previsão de atendimento foi atualizada. Novo horário estimado: %s (atraso aproximado de %s min).',
      to_char(timezone('America/Sao_Paulo', p_predicted_starts_at), 'HH24:MI'),
      v_delay
    );
  else
    v_message := format(
      'Há uma nova informação sobre sua consulta. Horário estimado: %s.',
      to_char(timezone('America/Sao_Paulo', p_predicted_starts_at), 'HH24:MI')
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
end;
$$;

comment on function public.patient_notify_schedule_update(uuid, timestamptz, integer) is
  'C038: notificação in-app sanitizada (sem prediction_reason / sem terceiros).';

revoke all on function public.patient_notify_schedule_update(uuid, timestamptz, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Append de previsões: notifica paciente quando atraso relevante muda
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

    -- Notifica somente atraso relevante (>=5 min vs agendado) ou salto >=5 vs previsão anterior.
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
         v_delay >= 5
         or (
           v_prev_delay is not null
           and abs(v_delay - v_prev_delay) >= 5
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
  'C032.2/C038: append versionado de previsões + notificação sanitizada à paciente quando atraso relevante.';

revoke all on function public.appointment_predictions_append(jsonb) from public, anon;
grant execute on function public.appointment_predictions_append(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Projeção sanitizada do portal (única fonte de previsão para a paciente)
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
      a.scheduled_starts_at as sort_at
    from public.appointments a
    left join public.professionals pr on pr.id = a.professional_id
    left join public.profiles pf on pf.id = pr.profile_id
    left join public.rooms r on r.id = a.room_id
    left join public.procedures proc on proc.id = a.procedure_id
    left join lateral (
      select ap.predicted_starts_at, ap.predicted_ends_at
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
    'appointments', coalesce(v_rows, '[]'::jsonb)
  );
end;
$$;

comment on function public.patient_portal_my_appointments(integer) is
  'C038: lista sanitizada de consultas da paciente autenticada. Sem prediction_reason, sem terceiros, sem agenda_blocks.';

revoke all on function public.patient_portal_my_appointments(integer) from public, anon;
grant execute on function public.patient_portal_my_appointments(integer) to authenticated;

-- Reafirmar: paciente sem SELECT em predictions brutas.
drop policy if exists appointment_predictions_patient_select
  on public.appointment_predictions;
