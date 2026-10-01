-- C032.2 — Motor de previsão: caminho de escrita versionado
-- Campos de appointment_predictions (0023) já suportam o motor — sem colunas novas.
-- RLS permanece SELECT-only para authenticated; INSERT apenas via RPC SECURITY DEFINER.
-- NÃO cria policy de paciente. NÃO altera starts_at/scheduled_*/prontuário.

-- ---------------------------------------------------------------------------
-- 1) Hardening de grants (somente SELECT direto; escrita via RPC)
-- ---------------------------------------------------------------------------

revoke all on table public.appointment_predictions from public;
revoke all on table public.appointment_predictions from anon;
revoke all on table public.appointment_predictions from authenticated;
grant select on table public.appointment_predictions to authenticated;

-- Garante ausência de policy de paciente.
drop policy if exists appointment_predictions_patient_select
  on public.appointment_predictions;

-- ---------------------------------------------------------------------------
-- 2) RPC: append de novas versões (não sobrescreve histórico)
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

    -- Não criar versão idêntica à vigente (evita spam em refresh).
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

    return next v_row;
  end loop;

  return;
end;
$$;

comment on function public.appointment_predictions_append(jsonb) is
  'C032.2: grava novas versões em appointment_predictions. Não altera appointments.starts_at/ends_at nem scheduled_*. prediction_reason permanece interno.';

revoke all on function public.appointment_predictions_append(jsonb) from public;
revoke all on function public.appointment_predictions_append(jsonb) from anon;
grant execute on function public.appointment_predictions_append(jsonb) to authenticated;

comment on table public.appointment_predictions is
  'C032.1/C032.2: histórico versionável de previsões (staff). Escrita via appointment_predictions_append. Nunca sobrescreve starts_at/ends_at nem scheduled_*. Paciente não lê esta tabela.';
