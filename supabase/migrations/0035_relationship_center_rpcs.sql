-- C036 — RPCs da Central de Relacionamentos
-- Mutações apenas via SECURITY DEFINER. Sem envio real de WhatsApp/e-mail/push.

-- ---------------------------------------------------------------------------
-- Helpers internos
-- ---------------------------------------------------------------------------

create or replace function public.relationship_render_message(
  p_body text,
  p_full_name text,
  p_clinic_name text default 'Casa Florescer',
  p_clinic_phone text default '',
  p_booking_link text default '',
  p_professional text default ''
)
returns text
language plpgsql
immutable
as $$
declare
  v_first text;
  v_out text;
begin
  v_first := split_part(btrim(coalesce(p_full_name, '')), ' ', 1);
  v_out := coalesce(p_body, '');
  v_out := replace(v_out, '{{nome}}', coalesce(p_full_name, ''));
  v_out := replace(v_out, '{{primeiro_nome}}', coalesce(nullif(v_first, ''), 'paciente'));
  v_out := replace(v_out, '{{nome_clinica}}', coalesce(p_clinic_name, 'Casa Florescer'));
  v_out := replace(v_out, '{{telefone_clinica}}', coalesce(p_clinic_phone, ''));
  v_out := replace(v_out, '{{link_agendamento}}', coalesce(p_booking_link, ''));
  v_out := replace(v_out, '{{data}}', to_char(current_date, 'DD/MM/YYYY'));
  v_out := replace(v_out, '{{profissional}}', coalesce(p_professional, ''));
  return v_out;
end;
$$;

revoke all on function public.relationship_render_message(text, text, text, text, text, text) from public, anon;
grant execute on function public.relationship_render_message(text, text, text, text, text, text) to authenticated;

create or replace function public.relationship_patient_eligible(
  p_organization uuid,
  p_practice uuid,
  p_patient uuid,
  p_channel text,
  p_purpose text
)
returns table (
  eligible boolean,
  reason text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_email text;
  v_pref public.communication_preferences%rowtype;
begin
  select phone, email into v_phone, v_email
  from public.patients
  where id = p_patient and organization_id = p_organization;

  if not found then
    eligible := false; reason := 'patient_not_found'; return next; return;
  end if;

  select * into v_pref
  from public.communication_preferences
  where practice_id = p_practice and patient_id = p_patient;

  if found then
    if p_purpose = 'administrative' then
      if v_pref.administrative_messages_enabled is not true then
        eligible := false; reason := 'admin_opt_out'; return next; return;
      end if;
    else
      if v_pref.campaign_messages_enabled is not true
         or v_pref.relationship_messages_enabled is not true
         or v_pref.campaign_opt_out_at is not null then
        eligible := false; reason := 'campaign_opt_out'; return next; return;
      end if;
    end if;

    if p_channel = 'whatsapp' and v_pref.whatsapp_enabled is not true then
      eligible := false; reason := 'whatsapp_disabled'; return next; return;
    end if;
    if p_channel = 'email' and v_pref.email_enabled is not true then
      eligible := false; reason := 'email_disabled'; return next; return;
    end if;
    if p_channel = 'push' and v_pref.push_enabled is not true then
      eligible := false; reason := 'push_disabled'; return next; return;
    end if;
  end if;

  if p_channel in ('whatsapp', 'phone') and (v_phone is null or btrim(v_phone) = '') then
    eligible := false; reason := 'no_phone'; return next; return;
  end if;
  if p_channel = 'email' and (v_email is null or btrim(v_email::text) = '') then
    eligible := false; reason := 'no_email'; return next; return;
  end if;

  eligible := true; reason := null; return next;
end;
$$;

revoke all on function public.relationship_patient_eligible(uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.relationship_patient_eligible(uuid, uuid, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Templates
-- ---------------------------------------------------------------------------

create or replace function public.campaign_template_upsert(p_payload jsonb)
returns public.campaign_templates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_org uuid;
  v_practice uuid;
  v_row public.campaign_templates%rowtype;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_org := (p_payload->>'organization_id')::uuid;
  v_practice := (p_payload->>'practice_id')::uuid;
  v_id := nullif(p_payload->>'id', '')::uuid;

  if not public.can_manage_relationship(v_org, v_practice) then
    raise exception 'FORBIDDEN';
  end if;

  if v_id is null then
    insert into public.campaign_templates (
      organization_id, practice_id, name, purpose, channel, subject, body,
      active, created_by, updated_by
    ) values (
      v_org, v_practice,
      btrim(p_payload->>'name'),
      p_payload->>'purpose',
      p_payload->>'channel',
      nullif(p_payload->>'subject', ''),
      btrim(p_payload->>'body'),
      coalesce((p_payload->>'active')::boolean, true),
      auth.uid(), auth.uid()
    )
    returning * into v_row;
  else
    update public.campaign_templates t
       set name = coalesce(nullif(btrim(p_payload->>'name'), ''), t.name),
           purpose = coalesce(nullif(p_payload->>'purpose', ''), t.purpose),
           channel = coalesce(nullif(p_payload->>'channel', ''), t.channel),
           subject = case when p_payload ? 'subject' then nullif(p_payload->>'subject', '') else t.subject end,
           body = coalesce(nullif(btrim(p_payload->>'body'), ''), t.body),
           active = coalesce((p_payload->>'active')::boolean, t.active),
           updated_by = auth.uid(),
           updated_at = now()
     where t.id = v_id
       and t.organization_id = v_org
       and t.practice_id = v_practice
    returning * into v_row;
    if not found then raise exception 'TEMPLATE_NOT_FOUND'; end if;
  end if;

  perform public.write_audit(
    case when v_id is null then 'insert'::public.audit_action else 'update'::public.audit_action end,
    'campaign_templates',
    v_row.id,
    v_practice,
    null,
    jsonb_build_object('rpc', 'campaign_template_upsert', 'event', 'TEMPLATE_UPSERTED', 'purpose', v_row.purpose)
  );
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Campaign create / update draft
-- ---------------------------------------------------------------------------

create or replace function public.campaign_create(p_payload jsonb)
returns public.campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_practice uuid;
  v_row public.campaigns%rowtype;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_org := (p_payload->>'organization_id')::uuid;
  v_practice := (p_payload->>'practice_id')::uuid;
  if not public.can_manage_relationship(v_org, v_practice) then
    raise exception 'FORBIDDEN';
  end if;

  insert into public.campaigns (
    organization_id, practice_id, name, objective, purpose, channel,
    template_id, message_subject, message_body, status, created_by
  ) values (
    v_org, v_practice,
    btrim(p_payload->>'name'),
    p_payload->>'objective',
    coalesce(nullif(p_payload->>'purpose', ''), 'relationship'),
    p_payload->>'channel',
    nullif(p_payload->>'template_id', '')::uuid,
    nullif(p_payload->>'message_subject', ''),
    nullif(p_payload->>'message_body', ''),
    'DRAFT',
    auth.uid()
  )
  returning * into v_row;

  perform public.write_audit(
    'insert'::public.audit_action,
    'campaigns',
    v_row.id,
    v_practice,
    null,
    jsonb_build_object('rpc', 'campaign_create', 'event', 'CAMPAIGN_CREATED', 'objective', v_row.objective)
  );
  return v_row;
end;
$$;

create or replace function public.campaign_update_draft(p_payload jsonb)
returns public.campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_row public.campaigns%rowtype;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_id := (p_payload->>'campaign_id')::uuid;
  select * into v_row from public.campaigns where id = v_id for update;
  if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
  if v_row.status not in ('DRAFT', 'AUDIENCE_REVIEW') then
    raise exception 'CAMPAIGN_NOT_EDITABLE';
  end if;
  if not public.can_manage_relationship(v_row.organization_id, v_row.practice_id) then
    raise exception 'FORBIDDEN';
  end if;

  update public.campaigns
     set name = coalesce(nullif(btrim(p_payload->>'name'), ''), name),
         objective = coalesce(nullif(p_payload->>'objective', ''), objective),
         purpose = coalesce(nullif(p_payload->>'purpose', ''), purpose),
         channel = coalesce(nullif(p_payload->>'channel', ''), channel),
         template_id = case when p_payload ? 'template_id' then nullif(p_payload->>'template_id', '')::uuid else template_id end,
         message_subject = case when p_payload ? 'message_subject' then nullif(p_payload->>'message_subject', '') else message_subject end,
         message_body = case when p_payload ? 'message_body' then nullif(p_payload->>'message_body', '') else message_body end,
         audience_filter = case when p_payload ? 'audience_filter' then nullif(p_payload->>'audience_filter', '') else audience_filter end,
         updated_at = now()
   where id = v_id
  returning * into v_row;

  perform public.write_audit(
    'update'::public.audit_action,
    'campaigns',
    v_row.id,
    v_row.practice_id,
    null,
    jsonb_build_object('rpc', 'campaign_update_draft', 'event', 'CAMPAIGN_UPDATED')
  );
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audience build (safe filters only)
-- ---------------------------------------------------------------------------

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
  v_ids uuid[];
  v_patient uuid;
  v_elig boolean;
  v_reason text;
  v_selected int := 0;
  v_eligible int := 0;
  v_ineligible int := 0;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_campaign := (p_payload->>'campaign_id')::uuid;
  v_filter := coalesce(nullif(p_payload->>'audience_filter', ''), 'manual');

  select * into v_c from public.campaigns where id = v_campaign for update;
  if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
  if v_c.audience_frozen_at is not null or v_c.status not in ('DRAFT', 'AUDIENCE_REVIEW') then
    raise exception 'AUDIENCE_FROZEN';
  end if;
  if not public.can_manage_relationship(v_c.organization_id, v_c.practice_id) then
    raise exception 'FORBIDDEN';
  end if;

  -- LGPD: filtros clínicos bloqueados nesta versão.
  if v_filter in ('by_diagnosis', 'by_pregnancy', 'by_procedure', 'by_exam') then
    raise exception 'FILTER_CLINICAL_BLOCKED';
  end if;

  delete from public.campaign_audiences where campaign_id = v_campaign;

  if v_filter = 'manual' then
    select coalesce(array_agg(x::uuid), '{}'::uuid[])
      into v_ids
    from jsonb_array_elements_text(coalesce(p_payload->'patient_ids', '[]'::jsonb)) as x;
  elsif v_filter = 'birthday_today' then
    select coalesce(array_agg(p.id), '{}'::uuid[])
      into v_ids
    from public.patients p
    where p.organization_id = v_c.organization_id
      and p.birth_date is not null
      and to_char(p.birth_date, 'MM-DD') = to_char(current_date, 'MM-DD');
  elsif v_filter = 'birthday_7d' then
    select coalesce(array_agg(p.id), '{}'::uuid[])
      into v_ids
    from public.patients p
    where p.organization_id = v_c.organization_id
      and p.birth_date is not null
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
    select coalesce(array_agg(p.id), '{}'::uuid[])
      into v_ids
    from public.patients p
    where p.organization_id = v_c.organization_id
      and not exists (
        select 1 from public.appointments a
        where a.patient_id = p.id
          and a.practice_id = v_c.practice_id
          and a.status not in ('cancelled', 'no_show')
          and a.starts_at >= (now() - interval '12 months')
      )
      and exists (
        select 1 from public.appointments a2
        where a2.patient_id = p.id
          and a2.practice_id = v_c.practice_id
          and a2.status not in ('cancelled', 'no_show')
      );
  elsif v_filter = 'no_upcoming' then
    select coalesce(array_agg(p.id), '{}'::uuid[])
      into v_ids
    from public.patients p
    where p.organization_id = v_c.organization_id
      and exists (
        select 1 from public.appointments a
        where a.patient_id = p.id
          and a.practice_id = v_c.practice_id
          and a.status not in ('cancelled', 'no_show')
          and a.starts_at < now()
          and a.starts_at >= (now() - interval '6 months')
      )
      and not exists (
        select 1 from public.appointments a2
        where a2.patient_id = p.id
          and a2.practice_id = v_c.practice_id
          and a2.status not in ('cancelled', 'no_show')
          and a2.starts_at >= now()
      );
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
    if v_elig then v_eligible := v_eligible + 1; else v_ineligible := v_ineligible + 1; end if;
  end loop;

  update public.campaigns
     set audience_filter = v_filter,
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
    'filter', v_filter
  );
end;
$$;

create or replace function public.campaign_audience_mutate(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign uuid;
  v_patient uuid;
  v_action text;
  v_c public.campaigns%rowtype;
  v_elig boolean;
  v_reason text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_campaign := (p_payload->>'campaign_id')::uuid;
  v_patient := (p_payload->>'patient_id')::uuid;
  v_action := p_payload->>'action';

  select * into v_c from public.campaigns where id = v_campaign for update;
  if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
  if v_c.audience_frozen_at is not null or v_c.status not in ('DRAFT', 'AUDIENCE_REVIEW') then
    raise exception 'AUDIENCE_FROZEN';
  end if;
  if not public.can_manage_relationship(v_c.organization_id, v_c.practice_id) then
    raise exception 'FORBIDDEN';
  end if;

  if v_action = 'remove' then
    delete from public.campaign_audiences
     where campaign_id = v_campaign and patient_id = v_patient;
  elsif v_action = 'add' then
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
    )
    on conflict (campaign_id, patient_id) do update
      set eligibility_status = excluded.eligibility_status,
          exclusion_reason = excluded.exclusion_reason,
          selected_by = auth.uid(),
          selected_at = now();
  else
    raise exception 'ACTION_INVALID';
  end if;

  perform public.write_audit(
    'update'::public.audit_action,
    'campaign_audiences',
    v_campaign,
    v_c.practice_id,
    v_patient,
    jsonb_build_object('rpc', 'campaign_audience_mutate', 'event', 'AUDIENCE_MUTATED', 'action', v_action)
  );

  return jsonb_build_object('ok', true, 'action', v_action, 'patient_id', v_patient);
end;
$$;

-- ---------------------------------------------------------------------------
-- Confirm prepare (NO real send)
-- ---------------------------------------------------------------------------

create or replace function public.campaign_confirm_prepare(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.campaigns%rowtype;
  v_dispatch public.campaign_dispatches%rowtype;
  v_aud record;
  v_patient public.patients%rowtype;
  v_body text;
  v_rendered text;
  v_msg public.campaign_messages%rowtype;
  v_total int := 0;
  v_blocked int := 0;
  v_opted int := 0;
  v_pending int := 0;
  v_provider boolean := false;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_c from public.campaigns where id = p_campaign_id for update;
  if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
  if not public.can_manage_relationship(v_c.organization_id, v_c.practice_id) then
    raise exception 'FORBIDDEN';
  end if;
  if v_c.status not in ('DRAFT', 'AUDIENCE_REVIEW', 'READY') then
    raise exception 'CAMPAIGN_NOT_CONFIRMABLE';
  end if;
  if v_c.message_body is null or btrim(v_c.message_body) = '' then
    raise exception 'MESSAGE_REQUIRED';
  end if;
  if not exists (
    select 1 from public.campaign_audiences a
    where a.campaign_id = v_c.id and a.eligibility_status = 'eligible'
  ) then
    raise exception 'AUDIENCE_EMPTY';
  end if;

  -- Provider real não configurado nesta etapa.
  v_provider := false;

  update public.campaigns
     set audience_frozen_at = coalesce(audience_frozen_at, now()),
         status = 'READY',
         approved_by = auth.uid(),
         approved_at = now(),
         updated_at = now()
   where id = v_c.id;

  insert into public.campaign_dispatches (
    campaign_id, organization_id, practice_id, channel, status,
    confirmed_by, provider_configured, simulation_only, notes
  ) values (
    v_c.id, v_c.organization_id, v_c.practice_id, v_c.channel, 'READY',
    auth.uid(), v_provider, true,
    'SIMULAÇÃO — envio real ainda não configurado. Nenhuma mensagem foi enviada.'
  )
  returning * into v_dispatch;

  for v_aud in
    select * from public.campaign_audiences
    where campaign_id = v_c.id
  loop
    v_total := v_total + 1;
    select * into v_patient from public.patients where id = v_aud.patient_id;
    v_body := v_c.message_body;
    v_rendered := public.relationship_render_message(
      v_body, v_patient.full_name, 'Casa Florescer', '', '', ''
    );

    if v_aud.eligibility_status <> 'eligible' then
      if v_aud.exclusion_reason = 'campaign_opt_out' then
        v_opted := v_opted + 1;
      else
        v_blocked := v_blocked + 1;
      end if;

      insert into public.campaign_messages (
        campaign_id, dispatch_id, organization_id, practice_id, patient_id,
        channel, rendered_message, status, idempotency_key, error_code, error_message
      ) values (
        v_c.id, v_dispatch.id, v_c.organization_id, v_c.practice_id, v_aud.patient_id,
        v_c.channel, v_rendered,
        case when v_aud.exclusion_reason = 'campaign_opt_out' then 'OPTED_OUT' else 'BLOCKED' end,
        v_c.id::text || ':' || v_aud.patient_id::text || ':' || v_c.channel,
        v_aud.exclusion_reason,
        'Paciente inelegível na confirmação.'
      )
      on conflict (campaign_id, patient_id, channel) do nothing
      returning * into v_msg;
    else
      v_pending := v_pending + 1;
      insert into public.campaign_messages (
        campaign_id, dispatch_id, organization_id, practice_id, patient_id,
        channel, rendered_message, status, idempotency_key, error_code, error_message
      ) values (
        v_c.id, v_dispatch.id, v_c.organization_id, v_c.practice_id, v_aud.patient_id,
        v_c.channel, v_rendered, 'PENDING',
        v_c.id::text || ':' || v_aud.patient_id::text || ':' || v_c.channel,
        'PROVIDER_NOT_CONFIGURED',
        'SIMULAÇÃO — NÃO ENVIADO. Canal ainda não configurado.'
      )
      on conflict (campaign_id, patient_id, channel) do update
        set rendered_message = excluded.rendered_message,
            dispatch_id = excluded.dispatch_id,
            status = 'PENDING',
            error_code = 'PROVIDER_NOT_CONFIGURED',
            error_message = excluded.error_message
      returning * into v_msg;
    end if;

    if v_msg.id is not null then
      insert into public.campaign_dispatch_recipients (dispatch_id, patient_id, message_id, status)
      values (v_dispatch.id, v_aud.patient_id, v_msg.id, v_msg.status)
      on conflict (dispatch_id, patient_id) do update
        set message_id = excluded.message_id, status = excluded.status;

      insert into public.relationship_history (
        organization_id, practice_id, patient_id, event_type, title, detail,
        campaign_id, actor_id
      ) values (
        v_c.organization_id, v_c.practice_id, v_aud.patient_id,
        'campaign_prepared',
        'Campanha preparada',
        'Mensagem preparada — envio real ainda não configurado.',
        v_c.id, auth.uid()
      );
    end if;
  end loop;

  update public.campaign_dispatches
     set quantity_total = v_total,
         quantity_processed = v_total,
         quantity_blocked = v_blocked,
         quantity_opted_out = v_opted,
         quantity_success = 0,
         quantity_failed = 0,
         notes = 'SIMULAÇÃO — NÃO ENVIADO. Preparadas: ' || v_pending::text ||
                 '; bloqueadas: ' || v_blocked::text ||
                 '; opt-out: ' || v_opted::text
   where id = v_dispatch.id;

  perform public.write_audit(
    'sign'::public.audit_action,
    'campaign_dispatches',
    v_dispatch.id,
    v_c.practice_id,
    null,
    jsonb_build_object(
      'rpc', 'campaign_confirm_prepare',
      'event', 'CAMPAIGN_PREPARED',
      'campaign_id', v_c.id,
      'simulation_only', true,
      'pending', v_pending,
      'blocked', v_blocked,
      'opted_out', v_opted
    )
  );

  return jsonb_build_object(
    'campaign_id', v_c.id,
    'dispatch_id', v_dispatch.id,
    'status', 'READY',
    'simulation_only', true,
    'provider_configured', false,
    'message', 'Envio real ainda não configurado. Nenhuma mensagem foi enviada.',
    'pending', v_pending,
    'blocked', v_blocked,
    'opted_out', v_opted,
    'total', v_total
  );
end;
$$;

create or replace function public.campaign_cancel(p_campaign_id uuid, p_reason text default null)
returns public.campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.campaigns%rowtype;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_row from public.campaigns where id = p_campaign_id for update;
  if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
  if not public.can_manage_relationship(v_row.organization_id, v_row.practice_id) then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.status in ('COMPLETED', 'CANCELLED') then
    raise exception 'CAMPAIGN_NOT_CANCELLABLE';
  end if;

  update public.campaigns
     set status = 'CANCELLED',
         cancelled_at = now(),
         cancelled_by = auth.uid(),
         updated_at = now()
   where id = p_campaign_id
  returning * into v_row;

  update public.campaign_dispatches
     set status = 'CANCELLED'
   where campaign_id = p_campaign_id
     and status in ('PENDING', 'READY', 'PROCESSING');

  perform public.write_audit(
    'update'::public.audit_action,
    'campaigns',
    v_row.id,
    v_row.practice_id,
    null,
    jsonb_build_object('rpc', 'campaign_cancel', 'event', 'CAMPAIGN_CANCELLED', 'reason', p_reason)
  );
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Preferences / opt-out
-- ---------------------------------------------------------------------------

create or replace function public.communication_preferences_upsert(p_payload jsonb)
returns public.communication_preferences
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_practice uuid;
  v_patient uuid;
  v_row public.communication_preferences%rowtype;
  v_opt_out boolean;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_org := (p_payload->>'organization_id')::uuid;
  v_practice := (p_payload->>'practice_id')::uuid;
  v_patient := (p_payload->>'patient_id')::uuid;
  if not public.can_manage_relationship(v_org, v_practice) then
    raise exception 'FORBIDDEN';
  end if;

  v_opt_out := coalesce((p_payload->>'campaign_opt_out')::boolean, false);

  insert into public.communication_preferences (
    organization_id, practice_id, patient_id,
    whatsapp_enabled, email_enabled, push_enabled,
    relationship_messages_enabled, campaign_messages_enabled, administrative_messages_enabled,
    preferred_channel,
    campaign_opt_out_at, campaign_opt_out_reason, campaign_opt_out_by
  ) values (
    v_org, v_practice, v_patient,
    coalesce((p_payload->>'whatsapp_enabled')::boolean, true),
    coalesce((p_payload->>'email_enabled')::boolean, true),
    coalesce((p_payload->>'push_enabled')::boolean, true),
    coalesce((p_payload->>'relationship_messages_enabled')::boolean, true),
    case when v_opt_out then false else coalesce((p_payload->>'campaign_messages_enabled')::boolean, true) end,
    coalesce((p_payload->>'administrative_messages_enabled')::boolean, true),
    coalesce(nullif(p_payload->>'preferred_channel', ''), 'whatsapp'),
    case when v_opt_out then now() else null end,
    case when v_opt_out then nullif(p_payload->>'campaign_opt_out_reason', '') else null end,
    case when v_opt_out then auth.uid() else null end
  )
  on conflict (practice_id, patient_id) do update
    set whatsapp_enabled = coalesce((p_payload->>'whatsapp_enabled')::boolean, public.communication_preferences.whatsapp_enabled),
        email_enabled = coalesce((p_payload->>'email_enabled')::boolean, public.communication_preferences.email_enabled),
        push_enabled = coalesce((p_payload->>'push_enabled')::boolean, public.communication_preferences.push_enabled),
        relationship_messages_enabled = coalesce((p_payload->>'relationship_messages_enabled')::boolean, public.communication_preferences.relationship_messages_enabled),
        campaign_messages_enabled = case
          when p_payload ? 'campaign_opt_out' and (p_payload->>'campaign_opt_out')::boolean then false
          when p_payload ? 'campaign_messages_enabled' then (p_payload->>'campaign_messages_enabled')::boolean
          else public.communication_preferences.campaign_messages_enabled
        end,
        administrative_messages_enabled = coalesce((p_payload->>'administrative_messages_enabled')::boolean, public.communication_preferences.administrative_messages_enabled),
        preferred_channel = coalesce(nullif(p_payload->>'preferred_channel', ''), public.communication_preferences.preferred_channel),
        campaign_opt_out_at = case
          when p_payload ? 'campaign_opt_out' and (p_payload->>'campaign_opt_out')::boolean then coalesce(public.communication_preferences.campaign_opt_out_at, now())
          when p_payload ? 'campaign_opt_out' and not (p_payload->>'campaign_opt_out')::boolean then null
          else public.communication_preferences.campaign_opt_out_at
        end,
        campaign_opt_out_reason = case
          when p_payload ? 'campaign_opt_out' and (p_payload->>'campaign_opt_out')::boolean then nullif(p_payload->>'campaign_opt_out_reason', '')
          when p_payload ? 'campaign_opt_out' and not (p_payload->>'campaign_opt_out')::boolean then null
          else public.communication_preferences.campaign_opt_out_reason
        end,
        campaign_opt_out_by = case
          when p_payload ? 'campaign_opt_out' and (p_payload->>'campaign_opt_out')::boolean then auth.uid()
          when p_payload ? 'campaign_opt_out' and not (p_payload->>'campaign_opt_out')::boolean then null
          else public.communication_preferences.campaign_opt_out_by
        end,
        updated_at = now()
  returning * into v_row;

  perform public.write_audit(
    'update'::public.audit_action,
    'communication_preferences',
    v_row.id,
    v_practice,
    v_patient,
    jsonb_build_object(
      'rpc', 'communication_preferences_upsert',
      'event', case when v_row.campaign_opt_out_at is not null then 'CAMPAIGN_OPT_OUT' else 'PREFERENCES_UPDATED' end
    )
  );
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Opportunities refresh + status
-- ---------------------------------------------------------------------------

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
  v_patient record;
  v_title text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.can_manage_relationship(p_organization_id, p_practice_id) then
    raise exception 'FORBIDDEN';
  end if;

  for v_patient in
    select p.id, p.full_name, p.birth_date
    from public.patients p
    where p.organization_id = p_organization_id
      and p.birth_date is not null
      and to_char(p.birth_date, 'MM-DD') = to_char(current_date, 'MM-DD')
  loop
    if not exists (
      select 1 from public.relationship_opportunities o
      where o.practice_id = p_practice_id
        and o.patient_id = v_patient.id
        and o.opportunity_type = 'birthday'
        and o.due_at = current_date
        and o.status in ('OPEN', 'IN_PROGRESS')
    ) then
      insert into public.relationship_opportunities (
        organization_id, practice_id, patient_id, opportunity_type,
        title, description, priority, status, due_at, source, created_by, metadata
      ) values (
        p_organization_id, p_practice_id, v_patient.id, 'birthday',
        'Aniversário',
        'Paciente faz aniversário hoje. Oportunidade de relacionamento.',
        'normal', 'OPEN', current_date, 'rule', auth.uid(),
        jsonb_build_object('rule', 'birthday_today')
      );
      v_bday := v_bday + 1;
    end if;
  end loop;

  for v_patient in
    select p.id, p.full_name
    from public.patients p
    where p.organization_id = p_organization_id
      and exists (
        select 1 from public.appointments a
        where a.patient_id = p.id
          and a.practice_id = p_practice_id
          and a.status not in ('cancelled', 'no_show')
      )
      and not exists (
        select 1 from public.appointments a2
        where a2.patient_id = p.id
          and a2.practice_id = p_practice_id
          and a2.status not in ('cancelled', 'no_show')
          and a2.starts_at >= (now() - interval '12 months')
      )
  loop
    if not exists (
      select 1 from public.relationship_opportunities o
      where o.practice_id = p_practice_id
        and o.patient_id = v_patient.id
        and o.opportunity_type = 'inactive_12m'
        and o.status in ('OPEN', 'IN_PROGRESS')
    ) then
      insert into public.relationship_opportunities (
        organization_id, practice_id, patient_id, opportunity_type,
        title, description, priority, status, due_at, source, created_by, metadata
      ) values (
        p_organization_id, p_practice_id, v_patient.id, 'inactive_12m',
        'Retorno após 12 meses',
        'Paciente sem nova consulta há 12 meses ou mais (sem conteúdo clínico).',
        'normal', 'OPEN', current_date, 'rule', auth.uid(),
        jsonb_build_object('rule', 'inactive_12m')
      );
      v_inactive := v_inactive + 1;
    end if;
  end loop;

  -- Notificação agregada para ops
  if v_bday > 0 or v_inactive > 0 then
    v_title := 'Oportunidades de relacionamento';
    insert into public.staff_notifications (
      organization_id, practice_id, recipient_profile_id,
      event_type, title, message, reference_type, reference_id
    )
    select
      p_organization_id, p_practice_id, upr.user_id,
      'relationship_opportunities_refresh',
      v_title,
      trim(both ' ' from
        case when v_bday > 0 then v_bday::text || ' aniversariante(s) hoje. ' else '' end ||
        case when v_inactive > 0 then v_inactive::text || ' paciente(s) há mais de 12 meses sem consulta.' else '' end
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
      'inactive_created', v_inactive
    )
  );

  return jsonb_build_object('birthday_created', v_bday, 'inactive_created', v_inactive);
end;
$$;

create or replace function public.relationship_opportunity_set_status(
  p_opportunity_id uuid,
  p_status text
)
returns public.relationship_opportunities
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.relationship_opportunities%rowtype;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_row from public.relationship_opportunities where id = p_opportunity_id for update;
  if not found then raise exception 'OPPORTUNITY_NOT_FOUND'; end if;
  if not public.can_manage_relationship(v_row.organization_id, v_row.practice_id) then
    raise exception 'FORBIDDEN';
  end if;
  if p_status not in ('OPEN', 'IN_PROGRESS', 'CONTACTED', 'CONVERTED', 'DISMISSED', 'EXPIRED') then
    raise exception 'STATUS_INVALID';
  end if;

  update public.relationship_opportunities
     set status = p_status,
         resolved_at = case when p_status in ('CONVERTED', 'DISMISSED', 'EXPIRED', 'CONTACTED') then now() else resolved_at end
   where id = p_opportunity_id
  returning * into v_row;

  perform public.write_audit(
    'update'::public.audit_action,
    'relationship_opportunities',
    v_row.id,
    v_row.practice_id,
    v_row.patient_id,
    jsonb_build_object('rpc', 'relationship_opportunity_set_status', 'event', 'OPPORTUNITY_STATUS', 'status', p_status)
  );
  return v_row;
end;
$$;

create or replace function public.relationship_opportunity_create_manual(p_payload jsonb)
returns public.relationship_opportunities
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_practice uuid;
  v_row public.relationship_opportunities%rowtype;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_org := (p_payload->>'organization_id')::uuid;
  v_practice := (p_payload->>'practice_id')::uuid;
  if not public.can_manage_relationship(v_org, v_practice) then
    raise exception 'FORBIDDEN';
  end if;

  insert into public.relationship_opportunities (
    organization_id, practice_id, patient_id, opportunity_type,
    title, description, priority, status, due_at, source, created_by, assigned_to
  ) values (
    v_org, v_practice,
    nullif(p_payload->>'patient_id', '')::uuid,
    coalesce(nullif(p_payload->>'opportunity_type', ''), 'manual'),
    btrim(p_payload->>'title'),
    nullif(p_payload->>'description', ''),
    coalesce(nullif(p_payload->>'priority', ''), 'normal'),
    'OPEN',
    coalesce(nullif(p_payload->>'due_at', '')::date, current_date),
    'manual',
    auth.uid(),
    auth.uid()
  )
  returning * into v_row;

  perform public.write_audit(
    'insert'::public.audit_action,
    'relationship_opportunities',
    v_row.id,
    v_practice,
    v_row.patient_id,
    jsonb_build_object('rpc', 'relationship_opportunity_create_manual', 'event', 'OPPORTUNITY_CREATED')
  );
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dashboard stats
-- ---------------------------------------------------------------------------

create or replace function public.relationship_dashboard_stats(
  p_organization_id uuid,
  p_practice_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.can_manage_relationship(p_organization_id, p_practice_id) then
    raise exception 'FORBIDDEN';
  end if;

  select jsonb_build_object(
    'opportunities_open', (
      select count(*)::int from public.relationship_opportunities
      where practice_id = p_practice_id and status in ('OPEN', 'IN_PROGRESS')
    ),
    'birthday_today', (
      select count(*)::int from public.relationship_opportunities
      where practice_id = p_practice_id and opportunity_type = 'birthday'
        and due_at = current_date and status in ('OPEN', 'IN_PROGRESS')
    ),
    'inactive_12m', (
      select count(*)::int from public.relationship_opportunities
      where practice_id = p_practice_id and opportunity_type = 'inactive_12m'
        and status in ('OPEN', 'IN_PROGRESS')
    ),
    'campaigns_draft', (
      select count(*)::int from public.campaigns
      where practice_id = p_practice_id and status in ('DRAFT', 'AUDIENCE_REVIEW')
    ),
    'campaigns_ready', (
      select count(*)::int from public.campaigns
      where practice_id = p_practice_id and status = 'READY'
    ),
    'messages_pending', (
      select count(*)::int from public.campaign_messages
      where practice_id = p_practice_id and status = 'PENDING'
    ),
    'messages_sent', (
      select count(*)::int from public.campaign_messages
      where practice_id = p_practice_id and status = 'SENT'
    ),
    'messages_failed', (
      select count(*)::int from public.campaign_messages
      where practice_id = p_practice_id and status = 'FAILED'
    ),
    'opt_outs', (
      select count(*)::int from public.communication_preferences
      where practice_id = p_practice_id and campaign_opt_out_at is not null
    ),
    'provider_whatsapp_configured', false,
    'provider_email_configured', false,
    'provider_push_configured', false
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.campaign_template_upsert(jsonb) from public, anon;
revoke all on function public.campaign_create(jsonb) from public, anon;
revoke all on function public.campaign_update_draft(jsonb) from public, anon;
revoke all on function public.campaign_build_audience(jsonb) from public, anon;
revoke all on function public.campaign_audience_mutate(jsonb) from public, anon;
revoke all on function public.campaign_confirm_prepare(uuid) from public, anon;
revoke all on function public.campaign_cancel(uuid, text) from public, anon;
revoke all on function public.communication_preferences_upsert(jsonb) from public, anon;
revoke all on function public.relationship_opportunities_refresh(uuid, uuid) from public, anon;
revoke all on function public.relationship_opportunity_set_status(uuid, text) from public, anon;
revoke all on function public.relationship_opportunity_create_manual(jsonb) from public, anon;
revoke all on function public.relationship_dashboard_stats(uuid, uuid) from public, anon;

grant execute on function public.campaign_template_upsert(jsonb) to authenticated;
grant execute on function public.campaign_create(jsonb) to authenticated;
grant execute on function public.campaign_update_draft(jsonb) to authenticated;
grant execute on function public.campaign_build_audience(jsonb) to authenticated;
grant execute on function public.campaign_audience_mutate(jsonb) to authenticated;
grant execute on function public.campaign_confirm_prepare(uuid) to authenticated;
grant execute on function public.campaign_cancel(uuid, text) to authenticated;
grant execute on function public.communication_preferences_upsert(jsonb) to authenticated;
grant execute on function public.relationship_opportunities_refresh(uuid, uuid) to authenticated;
grant execute on function public.relationship_opportunity_set_status(uuid, text) to authenticated;
grant execute on function public.relationship_opportunity_create_manual(jsonb) to authenticated;
grant execute on function public.relationship_dashboard_stats(uuid, uuid) to authenticated;
