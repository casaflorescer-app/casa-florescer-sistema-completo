-- C037 fix — escopo por prática em regras de aniversário / filtros combinados.
-- Evita que paciente sem vínculo administrativo na prática entre na fila da prática.

create or replace function public.relationship_opportunities_refresh(
  p_organization_id uuid,
  p_practice_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bday int := 0;
  v_inactive int := 0;
  v_no_upcoming int := 0;
  v_patient record;
  v_key text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.can_manage_relationship(p_organization_id, p_practice_id) then
    raise exception 'FORBIDDEN';
  end if;

  for v_patient in
    select p.id, p.birth_date
    from public.patients p
    where p.organization_id = p_organization_id
      and p.birth_date is not null
      and to_char(p.birth_date, 'MM-DD') = to_char(current_date, 'MM-DD')
      and exists (
        select 1 from public.appointments a
        where a.patient_id = p.id
          and a.practice_id = p_practice_id
          and a.status not in ('cancelled', 'no_show')
      )
  loop
    v_key := 'birthday:' || to_char(current_date, 'IYYY-MM-DD');
    if not exists (
      select 1 from public.relationship_opportunities o
      where o.practice_id = p_practice_id
        and o.patient_id = v_patient.id
        and o.opportunity_type = 'birthday'
        and o.dedupe_key = v_key
        and o.status in ('NEW', 'PENDING', 'OPEN', 'IN_PROGRESS')
    ) then
      insert into public.relationship_opportunities (
        organization_id, practice_id, patient_id, opportunity_type,
        title, description, priority, status, due_at, source, created_by,
        metadata, dedupe_key, next_action_at
      ) values (
        p_organization_id, p_practice_id, v_patient.id, 'birthday',
        'Aniversário',
        'Paciente faz aniversário hoje. Contato de relacionamento.',
        'normal', 'NEW', current_date, 'rule', auth.uid(),
        jsonb_build_object('rule', 'birthday_today'), v_key, now()
      );
      v_bday := v_bday + 1;
    end if;
  end loop;

  for v_patient in
    select p.id, p.birth_date
    from public.patients p
    where p.organization_id = p_organization_id
      and p.birth_date is not null
      and to_char(p.birth_date, 'MM-DD') <> to_char(current_date, 'MM-DD')
      and exists (
        select 1 from public.appointments a
        where a.patient_id = p.id
          and a.practice_id = p_practice_id
          and a.status not in ('cancelled', 'no_show')
      )
      and (
        (to_char(p.birth_date, 'MM-DD') > to_char(current_date, 'MM-DD')
         and to_char(p.birth_date, 'MM-DD') <= to_char(current_date + 7, 'MM-DD')
         and extract(month from current_date) = extract(month from current_date + 7))
        or (
          extract(month from current_date + 7) <> extract(month from current_date)
          and (
            to_char(p.birth_date, 'MM-DD') > to_char(current_date, 'MM-DD')
            or to_char(p.birth_date, 'MM-DD') <= to_char(current_date + 7, 'MM-DD')
          )
        )
      )
  loop
    v_key := 'birthday_week:' || to_char(current_date, 'IYYY-IW');
    if not exists (
      select 1 from public.relationship_opportunities o
      where o.practice_id = p_practice_id
        and o.patient_id = v_patient.id
        and o.opportunity_type = 'birthday'
        and o.dedupe_key = v_key
        and o.status in ('NEW', 'PENDING', 'OPEN', 'IN_PROGRESS')
    ) then
      insert into public.relationship_opportunities (
        organization_id, practice_id, patient_id, opportunity_type,
        title, description, priority, status, due_at, source, created_by,
        metadata, dedupe_key, next_action_at
      ) values (
        p_organization_id, p_practice_id, v_patient.id, 'birthday',
        'Aniversário esta semana',
        'Paciente com aniversário nos próximos 7 dias.',
        'normal', 'NEW', current_date + 3, 'rule', auth.uid(),
        jsonb_build_object('rule', 'birthday_7d'), v_key, now()
      );
      v_bday := v_bday + 1;
    end if;
  end loop;

  for v_patient in
    select p.id
    from public.patients p
    where p.organization_id = p_organization_id
      and exists (
        select 1 from public.appointments a
        where a.patient_id = p.id and a.practice_id = p_practice_id
          and a.status not in ('cancelled', 'no_show')
      )
      and not exists (
        select 1 from public.appointments a2
        where a2.patient_id = p.id and a2.practice_id = p_practice_id
          and a2.status not in ('cancelled', 'no_show')
          and a2.starts_at >= (now() - interval '12 months')
      )
  loop
    v_key := 'return_12m';
    if not exists (
      select 1 from public.relationship_opportunities o
      where o.practice_id = p_practice_id
        and o.patient_id = v_patient.id
        and o.opportunity_type in ('return_12_months', 'inactive_12m')
        and o.dedupe_key = v_key
        and o.status in ('NEW', 'PENDING', 'OPEN', 'IN_PROGRESS')
    ) then
      insert into public.relationship_opportunities (
        organization_id, practice_id, patient_id, opportunity_type,
        title, description, priority, status, due_at, source, created_by,
        metadata, dedupe_key, next_action_at
      ) values (
        p_organization_id, p_practice_id, v_patient.id, 'return_12_months',
        'Retorno após 12 meses',
        'Paciente sem nova consulta há 12 meses ou mais (sem conteúdo clínico).',
        'normal', 'NEW', current_date, 'rule', auth.uid(),
        jsonb_build_object('rule', 'return_12_months'), v_key, now()
      );
      v_inactive := v_inactive + 1;
    end if;
  end loop;

  for v_patient in
    select p.id
    from public.patients p
    where p.organization_id = p_organization_id
      and exists (
        select 1 from public.appointments a
        where a.patient_id = p.id and a.practice_id = p_practice_id
          and a.status not in ('cancelled', 'no_show') and a.starts_at < now()
      )
      and not exists (
        select 1 from public.appointments a2
        where a2.patient_id = p.id and a2.practice_id = p_practice_id
          and a2.status not in ('cancelled', 'no_show') and a2.starts_at >= now()
      )
  loop
    v_key := 'no_future';
    if not exists (
      select 1 from public.relationship_opportunities o
      where o.practice_id = p_practice_id
        and o.patient_id = v_patient.id
        and o.opportunity_type in ('no_future_appointment', 'no_upcoming')
        and o.dedupe_key = v_key
        and o.status in ('NEW', 'PENDING', 'OPEN', 'IN_PROGRESS')
    ) then
      insert into public.relationship_opportunities (
        organization_id, practice_id, patient_id, opportunity_type,
        title, description, priority, status, due_at, source, created_by,
        metadata, dedupe_key, next_action_at
      ) values (
        p_organization_id, p_practice_id, v_patient.id, 'no_future_appointment',
        'Sem agendamento futuro',
        'Paciente com histórico administrativo, sem novo agendamento futuro.',
        'normal', 'NEW', current_date, 'rule', auth.uid(),
        jsonb_build_object('rule', 'no_future_appointment'), v_key, now()
      );
      v_no_upcoming := v_no_upcoming + 1;
    end if;
  end loop;

  if v_bday > 0 or v_inactive > 0 or v_no_upcoming > 0 then
    insert into public.staff_notifications (
      organization_id, practice_id, recipient_profile_id,
      event_type, title, message, reference_type, reference_id
    )
    select
      p_organization_id, p_practice_id, upr.user_id,
      'relationship_opportunities_refresh',
      'Oportunidades de relacionamento',
      trim(both ' ' from
        case when v_bday > 0 then v_bday::text || ' aniversariante(s). ' else '' end ||
        case when v_inactive > 0 then v_inactive::text || ' retorno(s) 12 meses. ' else '' end ||
        case when v_no_upcoming > 0 then v_no_upcoming::text || ' sem agendamento futuro.' else '' end
      ),
      'relationship_opportunities', null
    from public.user_practice_roles upr
    join public.profiles pr on pr.id = upr.user_id
    where upr.practice_id = p_practice_id
      and upr.role in ('owner', 'admin', 'secretary')
      and pr.is_active;
  end if;

  perform public.write_audit(
    'insert'::public.audit_action,
    'relationship_opportunities',
    null,
    p_practice_id,
    null,
    jsonb_build_object(
      'rpc', 'relationship_opportunities_refresh',
      'event', 'OPPORTUNITIES_REFRESHED',
      'birthday_created', v_bday,
      'inactive_created', v_inactive,
      'no_upcoming_created', v_no_upcoming
    )
  );

  return jsonb_build_object(
    'birthday_created', v_bday,
    'inactive_created', v_inactive,
    'no_upcoming_created', v_no_upcoming
  );
end;
$$;
