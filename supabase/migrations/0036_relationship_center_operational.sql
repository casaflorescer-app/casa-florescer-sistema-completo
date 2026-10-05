-- C037 — Evolução operacional da Central de Relacionamentos
-- Não altera prontuário/SOAP/exames/orientações/receitas/agenda/prediction/blocks.
-- LGPD: filtros clínicos continuam bloqueados (FILTER_CLINICAL_BLOCKED).
-- Sem envio real de WhatsApp/e-mail/push.

-- ---------------------------------------------------------------------------
-- 1) Extensões em relationship_opportunities
-- ---------------------------------------------------------------------------

alter table public.relationship_opportunities
  add column if not exists campaign_id uuid references public.campaigns (id) on delete set null,
  add column if not exists last_action_at timestamptz,
  add column if not exists next_action_at timestamptz,
  add column if not exists dedupe_key text;

alter table public.relationship_opportunities
  drop constraint if exists relationship_opportunities_opportunity_type_check;

alter table public.relationship_opportunities
  add constraint relationship_opportunities_opportunity_type_check
  check (opportunity_type in (
    'birthday',
    'inactive_12m',
    'return_12_months',
    'no_upcoming',
    'no_future_appointment',
    'manual',
    'patient_requested_contact',
    'campaign_available',
    'campaign',
    'procedure_promotion',
    'event',
    'payment_pending',
    'contract_pending',
    'other'
  ));

alter table public.relationship_opportunities
  drop constraint if exists relationship_opportunities_status_check;

alter table public.relationship_opportunities
  add constraint relationship_opportunities_status_check
  check (status in (
    'NEW', 'PENDING', 'OPEN', 'IN_PROGRESS',
    'CONTACTED', 'CONVERTED', 'DISMISSED', 'EXPIRED'
  ));

alter table public.relationship_opportunities
  alter column status set default 'NEW';

alter table public.relationship_opportunities
  add column if not exists dedupe_patient_key uuid
  generated always as (coalesce(patient_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored;

alter table public.relationship_opportunities
  add column if not exists dedupe_key_norm text
  generated always as (coalesce(dedupe_key, '')) stored;

create unique index if not exists relationship_opportunities_dedupe_uidx
  on public.relationship_opportunities (
    practice_id, dedupe_patient_key, opportunity_type, dedupe_key_norm
  )
  where status in ('NEW', 'PENDING', 'OPEN', 'IN_PROGRESS');

create index if not exists relationship_opportunities_queue_idx
  on public.relationship_opportunities (practice_id, status, opportunity_type, created_at desc);

comment on column public.relationship_opportunities.dedupe_key is
  'Chave de idempotência da regra (ex.: birthday:2026-10-04). Sem conteúdo clínico.';

-- ---------------------------------------------------------------------------
-- 2) Objetivos de campanha + audience_filter
-- ---------------------------------------------------------------------------

alter table public.campaigns
  drop constraint if exists campaigns_objective_check;

alter table public.campaigns
  add constraint campaigns_objective_check
  check (objective in (
    'relationship', 'birthday', 'return', 'campaign', 'course',
    'news', 'procedure_promo', 'administrative', 'event', 'institutional', 'other'
  ));

alter table public.campaigns
  drop constraint if exists campaigns_audience_filter_check;

alter table public.campaigns
  add constraint campaigns_audience_filter_check
  check (
    audience_filter is null
    or audience_filter in (
      'manual',
      'birthday_today',
      'birthday_7d',
      'inactive_12m',
      'no_upcoming',
      'opportunity_pending',
      'combined'
    )
  );

alter table public.campaigns
  add column if not exists audience_filter_json jsonb not null default '{}'::jsonb;

comment on column public.campaigns.audience_filter_json is
  'Filtros administrativos combinados. Proibido conteúdo clínico.';

-- ---------------------------------------------------------------------------
-- 3) Popup descartável + feedback futuro (estrutura)
-- ---------------------------------------------------------------------------

create table if not exists public.relationship_attention_dismissals (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  fingerprint text not null,
  dismissed_at timestamptz not null default now(),
  primary key (profile_id, practice_id, fingerprint)
);

comment on table public.relationship_attention_dismissals is
  'Controle de popup/resumo da Central. Sem dados clínicos.';

revoke all on table public.relationship_attention_dismissals from public, anon, authenticated;
grant select on table public.relationship_attention_dismissals to authenticated;
alter table public.relationship_attention_dismissals enable row level security;

drop policy if exists relationship_attention_dismissals_self_select on public.relationship_attention_dismissals;
create policy relationship_attention_dismissals_self_select
  on public.relationship_attention_dismissals
  for select to authenticated
  using (
    profile_id = auth.uid()
    and public.can_manage_relationship(organization_id, practice_id)
  );

create table if not exists public.relationship_feedback_intents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  patient_id uuid not null references public.patients (id),
  campaign_id uuid references public.campaigns (id) on delete set null,
  message_id uuid references public.campaign_messages (id) on delete set null,
  intent text not null
    check (intent in (
      'interested',
      'want_to_schedule',
      'has_question',
      'not_interested',
      'talk_to_secretary'
    )),
  channel text check (channel in ('whatsapp', 'email', 'push', 'manual')),
  raw_payload jsonb not null default '{}'::jsonb,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  -- Estrutura preparada; respostas reais só quando houver canal integrado.
  check (received_at is null or received_at <= now() + interval '1 minute')
);

comment on table public.relationship_feedback_intents is
  'Arquitetura futura de resposta da paciente. Sem fingir respostas sem canal real.';

revoke all on table public.relationship_feedback_intents from public, anon, authenticated;
grant select on table public.relationship_feedback_intents to authenticated;
alter table public.relationship_feedback_intents enable row level security;

drop policy if exists relationship_feedback_intents_staff_select on public.relationship_feedback_intents;
create policy relationship_feedback_intents_staff_select
  on public.relationship_feedback_intents
  for select to authenticated
  using (public.can_manage_relationship(organization_id, practice_id));

-- ---------------------------------------------------------------------------
-- 4) Validação de variáveis de template
-- ---------------------------------------------------------------------------

create or replace function public.campaign_validate_template_body(p_body text)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_allowed text[] := array[
    'primeiro_nome', 'nome', 'nome_clinica', 'telefone_clinica',
    'link_agendamento', 'data', 'profissional'
  ];
  v_match text;
  v_invalid text[] := '{}';
  v_clinical text[] := array[
    'diagnostico', 'diagnosis', 'cid', 'soap', 'exame', 'exam',
    'orientacao', 'receita', 'gravidez', 'dum', 'dpp', 'clinical_notes'
  ];
begin
  for v_match in
    select distinct m[1]
    from regexp_matches(coalesce(p_body, ''), '\{\{\s*([a-zA-Z0-9_]+)\s*\}\}', 'g') as m
  loop
    if lower(v_match) = any (v_clinical) then
      raise exception 'FILTER_CLINICAL_BLOCKED';
    end if;
    if not (lower(v_match) = any (v_allowed)) then
      v_invalid := array_append(v_invalid, v_match);
    end if;
  end loop;

  if coalesce(array_length(v_invalid, 1), 0) > 0 then
    raise exception 'TEMPLATE_VARIABLE_INVALID:%', array_to_string(v_invalid, ',');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.campaign_validate_template_body(text) from public, anon;
grant execute on function public.campaign_validate_template_body(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Dashboard operacional expandido
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
  v_fp text;
  v_dismissed boolean := false;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.can_manage_relationship(p_organization_id, p_practice_id) then
    raise exception 'FORBIDDEN';
  end if;

  select jsonb_build_object(
    'opportunities_open', (
      select count(*)::int from public.relationship_opportunities
      where practice_id = p_practice_id
        and status in ('NEW', 'PENDING', 'OPEN', 'IN_PROGRESS')
    ),
    'opportunities_new', (
      select count(*)::int from public.relationship_opportunities
      where practice_id = p_practice_id and status in ('NEW', 'OPEN')
    ),
    'opportunities_pending', (
      select count(*)::int from public.relationship_opportunities
      where practice_id = p_practice_id and status in ('PENDING', 'IN_PROGRESS')
    ),
    'birthday_today', (
      select count(*)::int from public.relationship_opportunities
      where practice_id = p_practice_id
        and opportunity_type = 'birthday'
        and due_at = current_date
        and status in ('NEW', 'PENDING', 'OPEN', 'IN_PROGRESS')
    ),
    'birthday_week', (
      select count(*)::int from public.relationship_opportunities
      where practice_id = p_practice_id
        and opportunity_type = 'birthday'
        and due_at between current_date and current_date + 7
        and status in ('NEW', 'PENDING', 'OPEN', 'IN_PROGRESS')
    ),
    'inactive_12m', (
      select count(*)::int from public.relationship_opportunities
      where practice_id = p_practice_id
        and opportunity_type in ('inactive_12m', 'return_12_months')
        and status in ('NEW', 'PENDING', 'OPEN', 'IN_PROGRESS')
    ),
    'no_upcoming', (
      select count(*)::int from public.relationship_opportunities
      where practice_id = p_practice_id
        and opportunity_type in ('no_upcoming', 'no_future_appointment')
        and status in ('NEW', 'PENDING', 'OPEN', 'IN_PROGRESS')
    ),
    'campaigns_draft', (
      select count(*)::int from public.campaigns
      where practice_id = p_practice_id and status in ('DRAFT', 'AUDIENCE_REVIEW')
    ),
    'campaigns_ready', (
      select count(*)::int from public.campaigns
      where practice_id = p_practice_id and status = 'READY'
    ),
    'dispatches_prepared', (
      select count(*)::int from public.campaign_dispatches
      where practice_id = p_practice_id and status in ('READY', 'PENDING')
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
    'opt_outs_recent', (
      select count(*)::int from public.communication_preferences
      where practice_id = p_practice_id
        and campaign_opt_out_at is not null
        and campaign_opt_out_at > now() - interval '30 days'
    ),
    'provider_whatsapp_configured', false,
    'provider_email_configured', false,
    'provider_push_configured', false
  ) into v_result;

  v_fp := md5(
    coalesce((v_result->>'opportunities_open'), '0') || '|' ||
    coalesce((v_result->>'birthday_week'), '0') || '|' ||
    coalesce((v_result->>'inactive_12m'), '0') || '|' ||
    coalesce((v_result->>'no_upcoming'), '0') || '|' ||
    coalesce((v_result->>'campaigns_draft'), '0')
  );

  select exists (
    select 1 from public.relationship_attention_dismissals d
    where d.profile_id = auth.uid()
      and d.practice_id = p_practice_id
      and d.fingerprint = v_fp
  ) into v_dismissed;

  return v_result || jsonb_build_object(
    'attention_fingerprint', v_fp,
    'attention_dismissed', v_dismissed
  );
end;
$$;

create or replace function public.relationship_attention_dismiss(
  p_organization_id uuid,
  p_practice_id uuid,
  p_fingerprint text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.can_manage_relationship(p_organization_id, p_practice_id) then
    raise exception 'FORBIDDEN';
  end if;
  if p_fingerprint is null or btrim(p_fingerprint) = '' then
    raise exception 'FINGERPRINT_REQUIRED';
  end if;

  insert into public.relationship_attention_dismissals (
    profile_id, organization_id, practice_id, fingerprint
  ) values (
    auth.uid(), p_organization_id, p_practice_id, p_fingerprint
  )
  on conflict (profile_id, practice_id, fingerprint) do update
    set dismissed_at = now();
end;
$$;

revoke all on function public.relationship_attention_dismiss(uuid, uuid, text) from public, anon;
grant execute on function public.relationship_attention_dismiss(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Refresh de oportunidades (idempotente + no_future)
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
  v_no_upcoming int := 0;
  v_patient record;
  v_key text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.can_manage_relationship(p_organization_id, p_practice_id) then
    raise exception 'FORBIDDEN';
  end if;

  -- A) Aniversário hoje (somente pacientes com vínculo administrativo na prática)
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

  -- A2) Aniversário na semana (exceto hoje; somente com vínculo na prática)
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

  -- B) Retorno 12 meses
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

  -- C) Sem agendamento futuro
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

-- ---------------------------------------------------------------------------
-- 7) Status / create manual atualizados
-- ---------------------------------------------------------------------------

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
  if p_status not in ('NEW', 'PENDING', 'OPEN', 'IN_PROGRESS', 'CONTACTED', 'CONVERTED', 'DISMISSED', 'EXPIRED') then
    raise exception 'STATUS_INVALID';
  end if;

  update public.relationship_opportunities
     set status = p_status,
         assigned_to = coalesce(assigned_to, auth.uid()),
         last_action_at = now(),
         resolved_at = case
           when p_status in ('CONVERTED', 'DISMISSED', 'EXPIRED', 'CONTACTED') then now()
           else resolved_at
         end
   where id = p_opportunity_id
  returning * into v_row;

  insert into public.relationship_history (
    organization_id, practice_id, patient_id, event_type, title, detail,
    opportunity_id, actor_id
  )
  select
    v_row.organization_id, v_row.practice_id, v_row.patient_id,
    'opportunity_status',
    'Oportunidade atualizada',
    'Status: ' || p_status,
    v_row.id, auth.uid()
  where v_row.patient_id is not null;

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
  v_type text;
  v_row public.relationship_opportunities%rowtype;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_org := (p_payload->>'organization_id')::uuid;
  v_practice := (p_payload->>'practice_id')::uuid;
  v_type := coalesce(nullif(p_payload->>'opportunity_type', ''), 'manual');
  if not public.can_manage_relationship(v_org, v_practice) then
    raise exception 'FORBIDDEN';
  end if;
  if v_type not in (
    'birthday', 'inactive_12m', 'return_12_months', 'no_upcoming', 'no_future_appointment',
    'manual', 'patient_requested_contact', 'campaign_available', 'campaign',
    'procedure_promotion', 'event', 'payment_pending', 'contract_pending', 'other'
  ) then
    raise exception 'TYPE_INVALID';
  end if;

  insert into public.relationship_opportunities (
    organization_id, practice_id, patient_id, opportunity_type,
    title, description, priority, status, due_at, source, created_by, assigned_to,
    campaign_id, dedupe_key, next_action_at, last_action_at
  ) values (
    v_org, v_practice,
    nullif(p_payload->>'patient_id', '')::uuid,
    v_type,
    btrim(p_payload->>'title'),
    nullif(p_payload->>'description', ''),
    coalesce(nullif(p_payload->>'priority', ''), 'normal'),
    'NEW',
    coalesce(nullif(p_payload->>'due_at', '')::date, current_date),
    'manual',
    auth.uid(),
    coalesce(nullif(p_payload->>'assigned_to', '')::uuid, auth.uid()),
    nullif(p_payload->>'campaign_id', '')::uuid,
    coalesce(nullif(p_payload->>'dedupe_key', ''), 'manual:' || gen_random_uuid()::text),
    now(),
    now()
  )
  returning * into v_row;

  if v_row.patient_id is not null then
    insert into public.relationship_history (
      organization_id, practice_id, patient_id, event_type, title, detail,
      opportunity_id, campaign_id, actor_id
    ) values (
      v_org, v_practice, v_row.patient_id,
      'opportunity_created',
      'Oportunidade criada',
      v_row.title,
      v_row.id, v_row.campaign_id, auth.uid()
    );
  end if;

  perform public.write_audit(
    'insert'::public.audit_action,
    'relationship_opportunities',
    v_row.id,
    v_practice,
    v_row.patient_id,
    jsonb_build_object('rpc', 'relationship_opportunity_create_manual', 'event', 'OPPORTUNITY_CREATED', 'type', v_type)
  );
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) Fila "Pacientes para contatar"
-- ---------------------------------------------------------------------------

create or replace function public.relationship_contact_queue(
  p_organization_id uuid,
  p_practice_id uuid,
  p_filters jsonb default '{}'::jsonb,
  p_limit integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_clinical text[] := array[
    'diagnosis', 'diagnostico', 'cid', 'soap', 'exam', 'exame',
    'pregnancy', 'gravidez', 'orientation', 'orientacao', 'prescription',
    'receita', 'medication', 'medicamento', 'clinical_notes', 'dum', 'dpp'
  ];
  v_key text;
  v_rows jsonb;
  v_total int := 0;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.can_manage_relationship(p_organization_id, p_practice_id) then
    raise exception 'FORBIDDEN';
  end if;

  for v_key in select jsonb_object_keys(coalesce(p_filters, '{}'::jsonb))
  loop
    if lower(v_key) = any (v_clinical) then
      raise exception 'FILTER_CLINICAL_BLOCKED';
    end if;
  end loop;

  with base as (
    select
      o.id as opportunity_id,
      o.patient_id,
      p.full_name as patient_name,
      p.phone,
      p.email,
      coalesce(cp.preferred_channel, 'whatsapp') as preferred_channel,
      o.opportunity_type,
      o.title as opportunity_title,
      o.source,
      o.status,
      o.priority,
      o.due_at,
      o.next_action_at,
      o.created_at,
      o.assigned_to,
      pr.full_name as assignee_name,
      (
        select max(a.starts_at)
        from public.appointments a
        where a.patient_id = o.patient_id
          and a.practice_id = p_practice_id
          and a.status not in ('cancelled', 'no_show')
          and a.starts_at < now()
      ) as last_appointment_at,
      (
        select min(a2.starts_at)
        from public.appointments a2
        where a2.patient_id = o.patient_id
          and a2.practice_id = p_practice_id
          and a2.status not in ('cancelled', 'no_show')
          and a2.starts_at >= now()
      ) as next_appointment_at,
      case when cp.campaign_opt_out_at is not null then true else false end as campaign_opt_out
    from public.relationship_opportunities o
    left join public.patients p on p.id = o.patient_id
    left join public.communication_preferences cp
      on cp.practice_id = o.practice_id and cp.patient_id = o.patient_id
    left join public.profiles pr on pr.id = o.assigned_to
    where o.organization_id = p_organization_id
      and o.practice_id = p_practice_id
      and o.status in ('NEW', 'PENDING', 'OPEN', 'IN_PROGRESS')
      and (
        not coalesce((p_filters->>'birthday')::boolean, false)
        or o.opportunity_type = 'birthday'
      )
      and (
        not coalesce((p_filters->>'inactive_12m')::boolean, false)
        or o.opportunity_type in ('inactive_12m', 'return_12_months')
      )
      and (
        not coalesce((p_filters->>'no_upcoming')::boolean, false)
        or o.opportunity_type in ('no_upcoming', 'no_future_appointment')
      )
      and (
        not coalesce((p_filters->>'opportunity_pending')::boolean, false)
        or o.status in ('NEW', 'PENDING', 'OPEN', 'IN_PROGRESS')
      )
      and (
        nullif(p_filters->>'opportunity_status', '') is null
        or o.status = p_filters->>'opportunity_status'
      )
      and (
        nullif(p_filters->>'preferred_channel', '') is null
        or coalesce(cp.preferred_channel, 'whatsapp') = p_filters->>'preferred_channel'
      )
      and (
        not coalesce((p_filters->>'has_phone')::boolean, false)
        or (p.phone is not null and btrim(p.phone) <> '')
      )
      and (
        not coalesce((p_filters->>'has_email')::boolean, false)
        or (p.email is not null and btrim(p.email::text) <> '')
      )
      and (
        not coalesce((p_filters->>'opt_in')::boolean, false)
        or cp.campaign_opt_out_at is null
      )
  ),
  counted as (
    select count(*)::int as total from base
  ),
  page as (
    select * from base
    order by
      case when priority = 'high' then 0 when priority = 'normal' then 1 else 2 end,
      created_at desc nulls last
    limit greatest(coalesce(p_limit, 100), 1)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select
    (select total from counted),
    coalesce((
      select jsonb_agg(to_jsonb(page) order by
        case when page.priority = 'high' then 0 when page.priority = 'normal' then 1 else 2 end
      )
      from page
    ), '[]'::jsonb)
  into v_total, v_rows;

  return jsonb_build_object(
    'total', v_total,
    'rows', coalesce(v_rows, '[]'::jsonb),
    'limit', greatest(coalesce(p_limit, 100), 1),
    'offset', greatest(coalesce(p_offset, 0), 0)
  );
end;
$$;

revoke all on function public.relationship_contact_queue(uuid, uuid, jsonb, integer, integer) from public, anon;
grant execute on function public.relationship_contact_queue(uuid, uuid, jsonb, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 9) Audience build com filtros combinados + bloqueio clínico
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
    -- Base: pacientes da organização com vínculo administrativo na prática
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

    -- Se patient_ids também forem enviados, intersecta
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

-- ---------------------------------------------------------------------------
-- 10) Duplicar campanha + anti-duplicidade + prévia
-- ---------------------------------------------------------------------------

create or replace function public.campaign_duplicate(p_campaign_id uuid)
returns public.campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src public.campaigns%rowtype;
  v_row public.campaigns%rowtype;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_src from public.campaigns where id = p_campaign_id;
  if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
  if not public.can_manage_relationship(v_src.organization_id, v_src.practice_id) then
    raise exception 'FORBIDDEN';
  end if;

  insert into public.campaigns (
    organization_id, practice_id, name, objective, purpose, channel,
    template_id, message_subject, message_body, audience_filter,
    audience_filter_json, status, created_by
  ) values (
    v_src.organization_id, v_src.practice_id,
    left(v_src.name || ' (cópia)', 200),
    v_src.objective, v_src.purpose, v_src.channel,
    v_src.template_id, v_src.message_subject, v_src.message_body,
    v_src.audience_filter, v_src.audience_filter_json,
    'DRAFT', auth.uid()
  )
  returning * into v_row;

  perform public.write_audit(
    'insert'::public.audit_action,
    'campaigns',
    v_row.id,
    v_row.practice_id,
    null,
    jsonb_build_object('rpc', 'campaign_duplicate', 'event', 'CAMPAIGN_DUPLICATED', 'source', p_campaign_id)
  );
  return v_row;
end;
$$;

revoke all on function public.campaign_duplicate(uuid) from public, anon;
grant execute on function public.campaign_duplicate(uuid) to authenticated;

create or replace function public.campaign_check_recent_overlap(
  p_campaign_id uuid,
  p_days integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c public.campaigns%rowtype;
  v_rows jsonb;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_c from public.campaigns where id = p_campaign_id;
  if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
  if not public.can_manage_relationship(v_c.organization_id, v_c.practice_id) then
    raise exception 'FORBIDDEN';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'patient_id', a.patient_id,
    'patient_name', p.full_name,
    'previous_campaign_id', m.campaign_id,
    'previous_campaign_name', c.name,
    'previous_status', m.status,
    'previous_at', m.created_at
  )), '[]'::jsonb)
  into v_rows
  from public.campaign_audiences a
  join public.campaign_messages m
    on m.patient_id = a.patient_id
   and m.practice_id = a.practice_id
   and m.campaign_id <> p_campaign_id
   and m.created_at > now() - make_interval(days => greatest(coalesce(p_days, 30), 1))
  join public.campaigns c on c.id = m.campaign_id
  join public.patients p on p.id = a.patient_id
  where a.campaign_id = p_campaign_id
    and c.objective = v_c.objective
    and c.practice_id = v_c.practice_id;

  return jsonb_build_object(
    'window_days', greatest(coalesce(p_days, 30), 1),
    'overlaps', coalesce(v_rows, '[]'::jsonb),
    'count', coalesce(jsonb_array_length(v_rows), 0),
    'blocking', false
  );
end;
$$;

revoke all on function public.campaign_check_recent_overlap(uuid, integer) from public, anon;
grant execute on function public.campaign_check_recent_overlap(uuid, integer) to authenticated;

create or replace function public.campaign_preview_messages(
  p_campaign_id uuid,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c public.campaigns%rowtype;
  v_aud public.campaign_audiences%rowtype;
  v_patient public.patients%rowtype;
  v_total int;
  v_rendered text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_c from public.campaigns where id = p_campaign_id;
  if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
  if not public.can_manage_relationship(v_c.organization_id, v_c.practice_id) then
    raise exception 'FORBIDDEN';
  end if;
  if v_c.message_body is null or btrim(v_c.message_body) = '' then
    raise exception 'MESSAGE_REQUIRED';
  end if;

  perform public.campaign_validate_template_body(v_c.message_body);

  select count(*)::int into v_total
  from public.campaign_audiences
  where campaign_id = p_campaign_id;

  select * into v_aud
  from public.campaign_audiences
  where campaign_id = p_campaign_id
  order by selected_at, patient_id
  offset greatest(coalesce(p_offset, 0), 0)
  limit 1;

  if not found then
    return jsonb_build_object('total', v_total, 'offset', p_offset, 'row', null);
  end if;

  select * into v_patient from public.patients where id = v_aud.patient_id;
  v_rendered := public.relationship_render_message(
    v_c.message_body, v_patient.full_name, 'Casa Florescer', '', '', ''
  );

  return jsonb_build_object(
    'total', v_total,
    'offset', greatest(coalesce(p_offset, 0), 0),
    'row', jsonb_build_object(
      'patient_id', v_patient.id,
      'patient_name', v_patient.full_name,
      'phone', v_patient.phone,
      'channel', v_c.channel,
      'eligibility_status', v_aud.eligibility_status,
      'exclusion_reason', v_aud.exclusion_reason,
      'rendered_message', v_rendered
    )
  );
end;
$$;

revoke all on function public.campaign_preview_messages(uuid, integer) from public, anon;
grant execute on function public.campaign_preview_messages(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 11) Template upsert + confirm prepare com validação de variáveis
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
  v_body text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_org := (p_payload->>'organization_id')::uuid;
  v_practice := (p_payload->>'practice_id')::uuid;
  v_id := nullif(p_payload->>'id', '')::uuid;
  v_body := btrim(coalesce(p_payload->>'body', ''));

  if not public.can_manage_relationship(v_org, v_practice) then
    raise exception 'FORBIDDEN';
  end if;

  perform public.campaign_validate_template_body(v_body);

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
      v_body,
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
           body = coalesce(nullif(v_body, ''), t.body),
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

  perform public.campaign_validate_template_body(v_c.message_body);

  if not exists (
    select 1 from public.campaign_audiences a
    where a.campaign_id = v_c.id and a.eligibility_status = 'eligible'
  ) then
    raise exception 'AUDIENCE_EMPTY';
  end if;

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
    'SIMULAÇÃO — NÃO ENVIADO. Envio real ainda não configurado.'
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
    v_msg := null;

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
        'Paciente inelegível na preparação.'
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
        'Preparação concluída — SIMULAÇÃO — NÃO ENVIADO.',
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
         notes = 'Preparação concluída — SIMULAÇÃO — NÃO ENVIADO. Preparadas: ' || v_pending::text ||
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
    'message', 'Preparação concluída — SIMULAÇÃO — NÃO ENVIADO.',
    'pending', v_pending,
    'blocked', v_blocked,
    'opted_out', v_opted,
    'total', v_total
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 12) campaign_update_draft aceita filtros combinados
-- ---------------------------------------------------------------------------

create or replace function public.campaign_update_draft(p_payload jsonb)
returns public.campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_row public.campaigns%rowtype;
  v_body text;
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

  if p_payload ? 'message_body' and nullif(btrim(p_payload->>'message_body'), '') is not null then
    v_body := btrim(p_payload->>'message_body');
    perform public.campaign_validate_template_body(v_body);
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
         audience_filter_json = case when p_payload ? 'filters' then coalesce(p_payload->'filters', '{}'::jsonb) else audience_filter_json end,
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

revoke all on function public.campaign_update_draft(jsonb) from public, anon;
grant execute on function public.campaign_update_draft(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 13) Grants
-- ---------------------------------------------------------------------------


revoke all on function public.relationship_dashboard_stats(uuid, uuid) from public, anon;
grant execute on function public.relationship_dashboard_stats(uuid, uuid) to authenticated;
revoke all on function public.relationship_opportunities_refresh(uuid, uuid) from public, anon;
grant execute on function public.relationship_opportunities_refresh(uuid, uuid) to authenticated;
revoke all on function public.relationship_opportunity_set_status(uuid, text) from public, anon;
grant execute on function public.relationship_opportunity_set_status(uuid, text) to authenticated;
revoke all on function public.relationship_opportunity_create_manual(jsonb) from public, anon;
grant execute on function public.relationship_opportunity_create_manual(jsonb) to authenticated;
revoke all on function public.campaign_build_audience(jsonb) from public, anon;
grant execute on function public.campaign_build_audience(jsonb) to authenticated;
revoke all on function public.campaign_template_upsert(jsonb) from public, anon;
grant execute on function public.campaign_template_upsert(jsonb) to authenticated;
revoke all on function public.campaign_confirm_prepare(uuid) from public, anon;
grant execute on function public.campaign_confirm_prepare(uuid) to authenticated;
