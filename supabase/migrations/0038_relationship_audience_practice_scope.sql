-- C037 — reaplica campaign_build_audience com escopo por prática em aniversário/combined.
create or replace function public.campaign_build_audience(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign uuid;
  v_c public.campaigns%rowtype;
  v_filter text;
  v_filters jsonb;
  v_ids uuid[] := '{}';
  v_patient uuid;
  v_elig boolean;
  v_reason text;
  v_selected int := 0;
  v_eligible int := 0;
  v_ineligible int := 0;
  v_reasons jsonb := '{}'::jsonb;
  v_key text;
  v_clinical text[] := array[
    'diagnosis', 'diagnostico', 'cid', 'soap', 'exam', 'exame',
    'pregnancy', 'gravidez', 'orientation', 'orientacao', 'prescription',
    'receita', 'medication', 'medicamento', 'clinical_notes', 'dum', 'dpp',
    'by_diagnosis', 'by_pregnancy', 'by_procedure', 'by_exam'
  ];
  v_tmp uuid[];
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_campaign := (p_payload->>'campaign_id')::uuid;
  v_filter := coalesce(nullif(p_payload->>'audience_filter', ''), 'manual');
  v_filters := coalesce(p_payload->'filters', '{}'::jsonb);

  select * into v_c from public.campaigns where id = v_campaign for update;
  if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
  if v_c.audience_frozen_at is not null or v_c.status not in ('DRAFT', 'AUDIENCE_REVIEW') then
    raise exception 'AUDIENCE_FROZEN';
  end if;
  if not public.can_manage_relationship(v_c.organization_id, v_c.practice_id) then
    raise exception 'FORBIDDEN';
  end if;

  if v_filter = any (v_clinical) then
    raise exception 'FILTER_CLINICAL_BLOCKED';
  end if;
  for v_key in select jsonb_object_keys(v_filters)
  loop
    if lower(v_key) = any (v_clinical) then
      raise exception 'FILTER_CLINICAL_BLOCKED';
    end if;
  end loop;

  delete from public.campaign_audiences where campaign_id = v_campaign;

  if v_filter = 'manual' then
    select coalesce(array_agg(distinct x::uuid), '{}'::uuid[])
      into v_ids
    from jsonb_array_elements_text(coalesce(p_payload->'patient_ids', '[]'::jsonb)) as x;

  elsif v_filter = 'birthday_today' then
    select coalesce(array_agg(p.id), '{}'::uuid[]) into v_ids
    from public.patients p
    where p.organization_id = v_c.organization_id
      and p.birth_date is not null
      and to_char(p.birth_date, 'MM-DD') = to_char(current_date, 'MM-DD')
      and exists (
        select 1 from public.appointments a
        where a.patient_id = p.id and a.practice_id = v_c.practice_id
          and a.status not in ('cancelled', 'no_show')
      );

  elsif v_filter = 'birthday_7d' then
    select coalesce(array_agg(p.id), '{}'::uuid[]) into v_ids
    from public.patients p
    where p.organization_id = v_c.organization_id
      and p.birth_date is not null
      and exists (
        select 1 from public.appointments a
        where a.patient_id = p.id and a.practice_id = v_c.practice_id
          and a.status not in ('cancelled', 'no_show')
      )
      and (
        (to_char(p.birth_date, 'MM-DD') >= to_char(current_date, 'MM-DD')
         and to_char(p.birth_date, 'MM-DD') <= to_char(current_date + 7, 'MM-DD')
         and extract(month from current_date) = extract(month from current_date + 7))
        or
        (extract(month from current_date) <> extract(month from current_date + 7)
         and (to_char(p.birth_date, 'MM-DD') >= to_char(current_date, 'MM-DD')
              or to_char(p.birth_date, 'MM-DD') <= to_char(current_date + 7, 'MM-DD')))
      );

  elsif v_filter = 'inactive_12m' then
    select coalesce(array_agg(p.id), '{}'::uuid[]) into v_ids
    from public.patients p
    where p.organization_id = v_c.organization_id
      and not exists (
        select 1 from public.appointments a
        where a.patient_id = p.id and a.practice_id = v_c.practice_id
          and a.status not in ('cancelled', 'no_show')
          and a.starts_at >= (now() - interval '12 months')
      )
      and exists (
        select 1 from public.appointments a2
        where a2.patient_id = p.id and a2.practice_id = v_c.practice_id
          and a2.status not in ('cancelled', 'no_show')
      );

  elsif v_filter = 'no_upcoming' then
    select coalesce(array_agg(p.id), '{}'::uuid[]) into v_ids
    from public.patients p
    where p.organization_id = v_c.organization_id
      and exists (
        select 1 from public.appointments a
        where a.patient_id = p.id and a.practice_id = v_c.practice_id
          and a.status not in ('cancelled', 'no_show') and a.starts_at < now()
      )
      and not exists (
        select 1 from public.appointments a2
        where a2.patient_id = p.id and a2.practice_id = v_c.practice_id
          and a2.status not in ('cancelled', 'no_show') and a2.starts_at >= now()
      );

  elsif v_filter = 'opportunity_pending' then
    select coalesce(array_agg(distinct o.patient_id), '{}'::uuid[]) into v_ids
    from public.relationship_opportunities o
    where o.practice_id = v_c.practice_id
      and o.organization_id = v_c.organization_id
      and o.patient_id is not null
      and o.status in ('NEW', 'PENDING', 'OPEN', 'IN_PROGRESS');

  elsif v_filter = 'combined' then
    -- Base: pacientes da organizaÃ§Ã£o com vÃ­nculo administrativo na prÃ¡tica
    select coalesce(array_agg(distinct p.id), '{}'::uuid[]) into v_ids
    from public.patients p
    where p.organization_id = v_c.organization_id
      and exists (
        select 1 from public.appointments ax
        where ax.patient_id = p.id and ax.practice_id = v_c.practice_id
          and ax.status not in ('cancelled', 'no_show')
      )
      and (
        not coalesce((v_filters->>'birthday')::boolean, false)
        or (
          p.birth_date is not null
          and (
            to_char(p.birth_date, 'MM-DD') = to_char(current_date, 'MM-DD')
            or (
              (to_char(p.birth_date, 'MM-DD') >= to_char(current_date, 'MM-DD')
               and to_char(p.birth_date, 'MM-DD') <= to_char(current_date + 7, 'MM-DD'))
            )
          )
        )
      )
      and (
        not coalesce((v_filters->>'inactive_12m')::boolean, false)
        or (
          exists (
            select 1 from public.appointments a
            where a.patient_id = p.id and a.practice_id = v_c.practice_id
              and a.status not in ('cancelled', 'no_show')
          )
          and not exists (
            select 1 from public.appointments a2
            where a2.patient_id = p.id and a2.practice_id = v_c.practice_id
              and a2.status not in ('cancelled', 'no_show')
              and a2.starts_at >= (now() - interval '12 months')
          )
        )
      )
      and (
        not coalesce((v_filters->>'no_upcoming')::boolean, false)
        or (
          exists (
            select 1 from public.appointments a
            where a.patient_id = p.id and a.practice_id = v_c.practice_id
              and a.status not in ('cancelled', 'no_show') and a.starts_at < now()
          )
          and not exists (
            select 1 from public.appointments a2
            where a2.patient_id = p.id and a2.practice_id = v_c.practice_id
              and a2.status not in ('cancelled', 'no_show') and a2.starts_at >= now()
          )
        )
      )
      and (
        not coalesce((v_filters->>'opportunity_pending')::boolean, false)
        or exists (
          select 1 from public.relationship_opportunities o
          where o.patient_id = p.id and o.practice_id = v_c.practice_id
            and o.status in ('NEW', 'PENDING', 'OPEN', 'IN_PROGRESS')
        )
      )
      and (
        not coalesce((v_filters->>'has_phone')::boolean, false)
        or (p.phone is not null and btrim(p.phone) <> '')
      )
      and (
        not coalesce((v_filters->>'has_email')::boolean, false)
        or (p.email is not null and btrim(p.email::text) <> '')
      )
      and (
        not coalesce((v_filters->>'opt_in')::boolean, false)
        or not exists (
          select 1 from public.communication_preferences cp
          where cp.practice_id = v_c.practice_id
            and cp.patient_id = p.id
            and cp.campaign_opt_out_at is not null
        )
      )
      and (
        nullif(v_filters->>'preferred_channel', '') is null
        or exists (
          select 1 from public.communication_preferences cp2
          where cp2.practice_id = v_c.practice_id
            and cp2.patient_id = p.id
            and cp2.preferred_channel = v_filters->>'preferred_channel'
        )
        or (
          not exists (
            select 1 from public.communication_preferences cp3
            where cp3.practice_id = v_c.practice_id and cp3.patient_id = p.id
          )
          and v_filters->>'preferred_channel' = 'whatsapp'
        )
      );

    -- Se patient_ids tambÃ©m forem enviados, intersecta
    if jsonb_typeof(p_payload->'patient_ids') = 'array'
       and jsonb_array_length(p_payload->'patient_ids') > 0 then
      select coalesce(array_agg(x), '{}'::uuid[]) into v_tmp
      from unnest(v_ids) x
      where x in (
        select y::uuid from jsonb_array_elements_text(p_payload->'patient_ids') y
      );
      v_ids := v_tmp;
    end if;

  else
    raise exception 'FILTER_INVALID';
  end if;

  foreach v_patient in array v_ids loop
    select e.eligible, e.reason into v_elig, v_reason
    from public.relationship_patient_eligible(
      v_c.organization_id, v_c.practice_id, v_patient, v_c.channel, v_c.purpose
    ) e;

    insert into public.campaign_audiences (
      campaign_id, patient_id, organization_id, practice_id,
      eligibility_status, exclusion_reason, selected_by
    ) values (
      v_campaign, v_patient, v_c.organization_id, v_c.practice_id,
      case when v_elig then 'eligible' else 'ineligible' end,
      v_reason, auth.uid()
    );
    v_selected := v_selected + 1;
    if v_elig then
      v_eligible := v_eligible + 1;
    else
      v_ineligible := v_ineligible + 1;
      v_reasons := jsonb_set(
        v_reasons,
        array[coalesce(v_reason, 'other')],
        to_jsonb(coalesce((v_reasons->>coalesce(v_reason, 'other'))::int, 0) + 1)
      );
    end if;
  end loop;

  update public.campaigns
     set audience_filter = v_filter,
         audience_filter_json = v_filters,
         status = 'AUDIENCE_REVIEW',
         updated_at = now()
   where id = v_campaign;

  perform public.write_audit(
    'update'::public.audit_action,
    'campaign_audiences',
    v_campaign,
    v_c.practice_id,
    null,
    jsonb_build_object(
      'rpc', 'campaign_build_audience',
      'event', 'AUDIENCE_BUILT',
      'filter', v_filter,
      'selected', v_selected,
      'eligible', v_eligible,
      'ineligible', v_ineligible
    )
  );

  return jsonb_build_object(
    'selected', v_selected,
    'eligible', v_eligible,
    'ineligible', v_ineligible,
    'filter', v_filter,
    'ineligible_reasons', v_reasons
  );
end;
$$;


