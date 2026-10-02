-- C032.3 — Bloqueios operacionais da agenda + eventos + notificações internas
-- NÃO altera appointments.starts_at/ends_at nem scheduled_*.
-- NÃO altera prontuário / obstetrícia.
-- ends_at é obrigatório (motor TypeScript exige intervalo fechado).
-- Escrita via RPC SECURITY DEFINER; SELECT staff via can_schedule_in_org.
-- Paciente NÃO lê agenda_blocks / operational_events / staff_notifications.

-- ---------------------------------------------------------------------------
-- 1) Tabelas
-- ---------------------------------------------------------------------------

create table if not exists public.agenda_blocks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  professional_id uuid references public.professionals (id),
  room_id uuid references public.rooms (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  block_type text not null,
  reason_code text not null,
  title text not null,
  description text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'active', 'ended', 'cancelled')),
  recorded_after_start boolean not null default false,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id),
  cancellation_reason text,
  ended_at timestamptz,
  ended_by uuid references public.profiles (id),
  check (ends_at > starts_at),
  check (professional_id is not null or room_id is not null),
  check (
    block_type in (
      'EMERGENCIA_MEDICA',
      'PARTO_HOSPITALAR',
      'PROCEDIMENTO_EXTERNO',
      'REUNIAO',
      'COMPROMISSO_ADMINISTRATIVO',
      'AUSENCIA',
      'MANUTENCAO_SALA',
      'BLOQUEIO_OPERACIONAL',
      'OUTRO'
    )
  ),
  check (
    reason_code in (
      'EMERGENCIA_MEDICA',
      'PARTO_HOSPITALAR',
      'PROCEDIMENTO_EXTERNO',
      'REUNIAO',
      'COMPROMISSO_ADMINISTRATIVO',
      'AUSENCIA',
      'MANUTENCAO_SALA',
      'BLOQUEIO_OPERACIONAL',
      'OUTRO'
    )
  )
);

create index if not exists agenda_blocks_practice_starts_idx
  on public.agenda_blocks (practice_id, starts_at);

create index if not exists agenda_blocks_professional_starts_idx
  on public.agenda_blocks (professional_id, starts_at)
  where professional_id is not null and status <> 'cancelled';

create index if not exists agenda_blocks_room_starts_idx
  on public.agenda_blocks (room_id, starts_at)
  where room_id is not null and status <> 'cancelled';

comment on table public.agenda_blocks is
  'Bloqueios operacionais de agenda (profissional e/ou sala). Não cancela appointments nem altera starts_at.';

create table if not exists public.agenda_block_revisions (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.agenda_blocks (id) on delete cascade,
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  previous_starts_at timestamptz not null,
  previous_ends_at timestamptz not null,
  next_starts_at timestamptz not null,
  next_ends_at timestamptz not null,
  previous_status text not null,
  next_status text not null,
  change_kind text not null
    check (change_kind in ('create', 'update_window', 'cancel', 'end', 'reactivate')),
  note text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists agenda_block_revisions_block_idx
  on public.agenda_block_revisions (block_id, created_at);

comment on table public.agenda_block_revisions is
  'Histórico de alterações de intervalo/status de agenda_blocks. Append-only.';

create table if not exists public.operational_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  event_type text not null
    check (event_type in (
      'AGENDA_BLOCK_CREATED',
      'AGENDA_BLOCK_UPDATED',
      'AGENDA_BLOCK_CANCELLED',
      'AGENDA_BLOCK_ENDED',
      'AGENDA_PREDICTION_CHANGED'
    )),
  title text not null,
  message text not null,
  reference_type text not null,
  reference_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists operational_events_practice_created_idx
  on public.operational_events (practice_id, created_at desc);

comment on table public.operational_events is
  'Eventos operacionais internos (agenda). Preparação para Central de Relacionamentos futura. Sem WhatsApp.';

create table if not exists public.staff_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid references public.practice_units (id),
  recipient_profile_id uuid not null references public.profiles (id),
  event_type text not null,
  title text not null,
  message text not null,
  reference_type text,
  reference_id uuid,
  operational_event_id uuid references public.operational_events (id),
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists staff_notifications_recipient_created_idx
  on public.staff_notifications (recipient_profile_id, created_at desc);

comment on table public.staff_notifications is
  'Notificações internas por destinatário. Usuário só lê as próprias. Sem push/WhatsApp nesta etapa.';

-- ---------------------------------------------------------------------------
-- 2) Grants / RLS
-- ---------------------------------------------------------------------------

revoke all on table public.agenda_blocks from public, anon, authenticated;
revoke all on table public.agenda_block_revisions from public, anon, authenticated;
revoke all on table public.operational_events from public, anon, authenticated;
revoke all on table public.staff_notifications from public, anon, authenticated;

grant select on table public.agenda_blocks to authenticated;
grant select on table public.agenda_block_revisions to authenticated;
grant select on table public.operational_events to authenticated;
grant select on table public.staff_notifications to authenticated;

alter table public.agenda_blocks enable row level security;
alter table public.agenda_block_revisions enable row level security;
alter table public.operational_events enable row level security;
alter table public.staff_notifications enable row level security;

drop policy if exists agenda_blocks_staff_select on public.agenda_blocks;
create policy agenda_blocks_staff_select on public.agenda_blocks
  for select to authenticated
  using (public.can_schedule_in_org(organization_id, practice_id));

drop policy if exists agenda_block_revisions_staff_select on public.agenda_block_revisions;
create policy agenda_block_revisions_staff_select on public.agenda_block_revisions
  for select to authenticated
  using (public.can_schedule_in_org(organization_id, practice_id));

drop policy if exists operational_events_staff_select on public.operational_events;
create policy operational_events_staff_select on public.operational_events
  for select to authenticated
  using (public.can_schedule_in_org(organization_id, practice_id));

drop policy if exists staff_notifications_recipient_select on public.staff_notifications;
create policy staff_notifications_recipient_select on public.staff_notifications
  for select to authenticated
  using (recipient_profile_id = auth.uid());

-- Sem policy de paciente. Sem INSERT/UPDATE/DELETE direto.

-- ---------------------------------------------------------------------------
-- 3) Helpers internos
-- ---------------------------------------------------------------------------

create or replace function public.agenda_block_resolve_status(
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_now timestamptz default now()
)
returns text
language sql
immutable
as $$
  select case
    when p_ends_at <= p_now then 'ended'
    when p_starts_at <= p_now then 'active'
    else 'scheduled'
  end;
$$;

create or replace function public.agenda_block_notify_staff(
  p_organization_id uuid,
  p_practice_id uuid,
  p_event_id uuid,
  p_event_type text,
  p_title text,
  p_message text,
  p_reference_type text,
  p_reference_id uuid,
  p_professional_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  -- Owner/admin/secretária da prática + profissional diretamente afetado.
  for v_profile_id in
    select distinct upr.user_id
    from public.user_practice_roles upr
    where upr.practice_id = p_practice_id
      and upr.role in ('owner', 'admin', 'secretary')
      and exists (
        select 1 from public.profiles p
        where p.id = upr.user_id and p.is_active
      )
    union
    select pr.profile_id
    from public.professionals pr
    where p_professional_id is not null
      and pr.id = p_professional_id
      and pr.organization_id = p_organization_id
  loop
    insert into public.staff_notifications (
      organization_id,
      practice_id,
      recipient_profile_id,
      event_type,
      title,
      message,
      reference_type,
      reference_id,
      operational_event_id
    ) values (
      p_organization_id,
      p_practice_id,
      v_profile_id,
      p_event_type,
      p_title,
      p_message,
      p_reference_type,
      p_reference_id,
      p_event_id
    );
  end loop;
end;
$$;

revoke all on function public.agenda_block_resolve_status(timestamptz, timestamptz, timestamptz) from public;
revoke all on function public.agenda_block_notify_staff(uuid, uuid, uuid, text, text, text, text, uuid, uuid) from public;
grant execute on function public.agenda_block_resolve_status(timestamptz, timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) RPC: criar bloqueio
-- ---------------------------------------------------------------------------

create or replace function public.agenda_block_create(p_payload jsonb)
returns public.agenda_blocks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_practice uuid;
  v_professional uuid;
  v_room uuid;
  v_starts timestamptz;
  v_ends timestamptz;
  v_block_type text;
  v_reason_code text;
  v_title text;
  v_description text;
  v_status text;
  v_recorded_after boolean;
  v_row public.agenda_blocks%rowtype;
  v_event_id uuid;
  v_affected integer;
  v_msg text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active
  ) then
    raise exception 'PROFILE_INACTIVE';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'AGENDA_BLOCK_INVALID';
  end if;

  begin
    v_org := (p_payload->>'organization_id')::uuid;
    v_practice := (p_payload->>'practice_id')::uuid;
    v_professional := nullif(p_payload->>'professional_id', '')::uuid;
    v_room := nullif(p_payload->>'room_id', '')::uuid;
    v_starts := (p_payload->>'starts_at')::timestamptz;
    v_ends := (p_payload->>'ends_at')::timestamptz;
  exception when others then
    raise exception 'AGENDA_BLOCK_INVALID';
  end;

  v_block_type := upper(btrim(coalesce(p_payload->>'block_type', '')));
  v_reason_code := upper(btrim(coalesce(p_payload->>'reason_code', v_block_type)));
  v_title := nullif(btrim(coalesce(p_payload->>'title', '')), '');
  v_description := nullif(btrim(coalesce(p_payload->>'description', '')), '');

  if v_org is null or v_practice is null or v_starts is null or v_ends is null then
    raise exception 'AGENDA_BLOCK_INVALID';
  end if;

  if v_ends <= v_starts then
    raise exception 'AGENDA_BLOCK_RANGE_INVALID';
  end if;

  if v_professional is null and v_room is null then
    raise exception 'AGENDA_BLOCK_TARGET_REQUIRED';
  end if;

  if v_title is null then
    v_title := initcap(replace(lower(v_reason_code), '_', ' '));
  end if;

  if not public.can_schedule_in_org(v_org, v_practice) then
    raise exception 'FORBIDDEN';
  end if;

  if not exists (
    select 1 from public.practice_units pu
    where pu.id = v_practice and pu.organization_id = v_org
  ) then
    raise exception 'PRACTICE_MISMATCH';
  end if;

  if v_professional is not null then
    if not exists (
      select 1
      from public.professionals pr
      join public.profiles pf on pf.id = pr.profile_id
      where pr.id = v_professional
        and pr.organization_id = v_org
        and pr.practice_id = v_practice
        and pf.is_active
    ) then
      raise exception 'PROFESSIONAL_INVALID';
    end if;
  end if;

  if v_room is not null then
    if not exists (
      select 1 from public.rooms r
      where r.id = v_room
        and r.organization_id = v_org
        and r.status = 'active'
    ) then
      raise exception 'ROOM_INVALID';
    end if;
  end if;

  v_status := public.agenda_block_resolve_status(v_starts, v_ends, now());
  v_recorded_after := v_starts < now();

  insert into public.agenda_blocks (
    organization_id,
    practice_id,
    professional_id,
    room_id,
    starts_at,
    ends_at,
    block_type,
    reason_code,
    title,
    description,
    status,
    recorded_after_start,
    created_by,
    updated_by
  ) values (
    v_org,
    v_practice,
    v_professional,
    v_room,
    v_starts,
    v_ends,
    v_block_type,
    v_reason_code,
    v_title,
    v_description,
    v_status,
    v_recorded_after,
    auth.uid(),
    auth.uid()
  )
  returning * into v_row;

  insert into public.agenda_block_revisions (
    block_id, organization_id, practice_id,
    previous_starts_at, previous_ends_at, next_starts_at, next_ends_at,
    previous_status, next_status, change_kind, note, created_by
  ) values (
    v_row.id, v_org, v_practice,
    v_starts, v_ends, v_starts, v_ends,
    v_status, v_status, 'create', v_description, auth.uid()
  );

  select count(*)::integer into v_affected
  from public.appointments a
  where a.organization_id = v_org
    and a.practice_id = v_practice
    and a.status not in ('cancelled', 'no_show')
    and a.actual_end_at is null
    and a.starts_at < v_ends
    and a.ends_at > v_starts
    and (
      (v_professional is not null and a.professional_id = v_professional)
      or (v_room is not null and a.room_id = v_room)
    );

  v_msg := format(
    'Bloqueio %s–%s. %s atendimento(s) potencialmente afetado(s). Horários administrativos preservados.',
    to_char(v_starts at time zone 'America/Sao_Paulo', 'HH24:MI'),
    to_char(v_ends at time zone 'America/Sao_Paulo', 'HH24:MI'),
    v_affected
  );

  insert into public.operational_events (
    organization_id, practice_id, event_type, title, message,
    reference_type, reference_id, payload, created_by
  ) values (
    v_org, v_practice, 'AGENDA_BLOCK_CREATED',
    'Alteração de agenda',
    v_msg,
    'agenda_block', v_row.id,
    jsonb_build_object(
      'block_id', v_row.id,
      'starts_at', v_row.starts_at,
      'ends_at', v_row.ends_at,
      'reason_code', v_row.reason_code,
      'affected_count', v_affected,
      'recorded_after_start', v_recorded_after
    ),
    auth.uid()
  )
  returning id into v_event_id;

  perform public.agenda_block_notify_staff(
    v_org, v_practice, v_event_id, 'AGENDA_BLOCK_CREATED',
    'Alteração de agenda', v_msg, 'agenda_block', v_row.id, v_professional
  );

  perform public.write_audit(
    'insert'::public.audit_action,
    'agenda_blocks',
    v_row.id,
    v_practice,
    null,
    jsonb_build_object(
      'rpc', 'agenda_block_create',
      'starts_at', v_row.starts_at,
      'ends_at', v_row.ends_at,
      'reason_code', v_row.reason_code,
      'professional_id', v_professional,
      'room_id', v_room,
      'affected_count', v_affected
    )
  );

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) RPC: atualizar janela (fim estimado)
-- ---------------------------------------------------------------------------

create or replace function public.agenda_block_update(p_payload jsonb)
returns public.agenda_blocks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_starts timestamptz;
  v_ends timestamptz;
  v_description text;
  v_row public.agenda_blocks%rowtype;
  v_prev_starts timestamptz;
  v_prev_ends timestamptz;
  v_prev_status text;
  v_event_id uuid;
  v_msg text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active
  ) then
    raise exception 'PROFILE_INACTIVE';
  end if;

  begin
    v_id := (p_payload->>'id')::uuid;
    v_starts := nullif(p_payload->>'starts_at', '')::timestamptz;
    v_ends := nullif(p_payload->>'ends_at', '')::timestamptz;
  exception when others then
    raise exception 'AGENDA_BLOCK_INVALID';
  end;

  v_description := nullif(btrim(coalesce(p_payload->>'description', '')), '');

  if v_id is null then
    raise exception 'AGENDA_BLOCK_INVALID';
  end if;

  select * into v_row
  from public.agenda_blocks
  where id = v_id
  for update;

  if not found then
    raise exception 'AGENDA_BLOCK_NOT_FOUND';
  end if;

  if v_row.status = 'cancelled' then
    raise exception 'AGENDA_BLOCK_CANCELLED';
  end if;

  if not public.can_schedule_in_org(v_row.organization_id, v_row.practice_id) then
    raise exception 'FORBIDDEN';
  end if;

  v_prev_starts := v_row.starts_at;
  v_prev_ends := v_row.ends_at;
  v_prev_status := v_row.status;

  if v_starts is null then v_starts := v_row.starts_at; end if;
  if v_ends is null then v_ends := v_row.ends_at; end if;

  if v_ends <= v_starts then
    raise exception 'AGENDA_BLOCK_RANGE_INVALID';
  end if;

  update public.agenda_blocks
     set starts_at = v_starts,
         ends_at = v_ends,
         description = coalesce(v_description, description),
         status = public.agenda_block_resolve_status(v_starts, v_ends, now()),
         updated_at = now(),
         updated_by = auth.uid()
   where id = v_id
  returning * into v_row;

  insert into public.agenda_block_revisions (
    block_id, organization_id, practice_id,
    previous_starts_at, previous_ends_at, next_starts_at, next_ends_at,
    previous_status, next_status, change_kind, note, created_by
  ) values (
    v_row.id, v_row.organization_id, v_row.practice_id,
    v_prev_starts, v_prev_ends, v_row.starts_at, v_row.ends_at,
    v_prev_status, v_row.status, 'update_window', v_description, auth.uid()
  );

  v_msg := format(
    'Bloqueio atualizado: %s–%s (antes %s–%s).',
    to_char(v_row.starts_at at time zone 'America/Sao_Paulo', 'HH24:MI'),
    to_char(v_row.ends_at at time zone 'America/Sao_Paulo', 'HH24:MI'),
    to_char(v_prev_starts at time zone 'America/Sao_Paulo', 'HH24:MI'),
    to_char(v_prev_ends at time zone 'America/Sao_Paulo', 'HH24:MI')
  );

  insert into public.operational_events (
    organization_id, practice_id, event_type, title, message,
    reference_type, reference_id, payload, created_by
  ) values (
    v_row.organization_id, v_row.practice_id, 'AGENDA_BLOCK_UPDATED',
    'Alteração de agenda', v_msg,
    'agenda_block', v_row.id,
    jsonb_build_object(
      'block_id', v_row.id,
      'previous_starts_at', v_prev_starts,
      'previous_ends_at', v_prev_ends,
      'starts_at', v_row.starts_at,
      'ends_at', v_row.ends_at
    ),
    auth.uid()
  )
  returning id into v_event_id;

  perform public.agenda_block_notify_staff(
    v_row.organization_id, v_row.practice_id, v_event_id, 'AGENDA_BLOCK_UPDATED',
    'Alteração de agenda', v_msg, 'agenda_block', v_row.id, v_row.professional_id
  );

  perform public.write_audit(
    'update'::public.audit_action,
    'agenda_blocks',
    v_row.id,
    v_row.practice_id,
    null,
    jsonb_build_object(
      'rpc', 'agenda_block_update',
      'previous_starts_at', v_prev_starts,
      'previous_ends_at', v_prev_ends,
      'starts_at', v_row.starts_at,
      'ends_at', v_row.ends_at
    )
  );

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) RPC: cancelar / encerrar
-- ---------------------------------------------------------------------------

create or replace function public.agenda_block_cancel(
  p_block_id uuid,
  p_reason text default null
)
returns public.agenda_blocks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.agenda_blocks%rowtype;
  v_prev_status text;
  v_event_id uuid;
  v_msg text;
  v_reason text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active
  ) then
    raise exception 'PROFILE_INACTIVE';
  end if;

  select * into v_row from public.agenda_blocks where id = p_block_id for update;
  if not found then
    raise exception 'AGENDA_BLOCK_NOT_FOUND';
  end if;

  if v_row.status = 'cancelled' then
    return v_row;
  end if;

  if not public.can_schedule_in_org(v_row.organization_id, v_row.practice_id) then
    raise exception 'FORBIDDEN';
  end if;

  v_prev_status := v_row.status;
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');

  update public.agenda_blocks
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = auth.uid(),
         cancellation_reason = v_reason,
         updated_at = now(),
         updated_by = auth.uid()
   where id = p_block_id
  returning * into v_row;

  insert into public.agenda_block_revisions (
    block_id, organization_id, practice_id,
    previous_starts_at, previous_ends_at, next_starts_at, next_ends_at,
    previous_status, next_status, change_kind, note, created_by
  ) values (
    v_row.id, v_row.organization_id, v_row.practice_id,
    v_row.starts_at, v_row.ends_at, v_row.starts_at, v_row.ends_at,
    v_prev_status, 'cancelled', 'cancel', v_reason, auth.uid()
  );

  v_msg := 'Bloqueio operacional cancelado. Previsões serão recalculadas.';

  insert into public.operational_events (
    organization_id, practice_id, event_type, title, message,
    reference_type, reference_id, payload, created_by
  ) values (
    v_row.organization_id, v_row.practice_id, 'AGENDA_BLOCK_CANCELLED',
    'Alteração de agenda', v_msg,
    'agenda_block', v_row.id,
    jsonb_build_object('block_id', v_row.id, 'reason', v_reason),
    auth.uid()
  )
  returning id into v_event_id;

  perform public.agenda_block_notify_staff(
    v_row.organization_id, v_row.practice_id, v_event_id, 'AGENDA_BLOCK_CANCELLED',
    'Alteração de agenda', v_msg, 'agenda_block', v_row.id, v_row.professional_id
  );

  perform public.write_audit(
    'update'::public.audit_action,
    'agenda_blocks',
    v_row.id,
    v_row.practice_id,
    null,
    jsonb_build_object('rpc', 'agenda_block_cancel', 'reason', v_reason)
  );

  return v_row;
end;
$$;

create or replace function public.agenda_block_end(p_block_id uuid)
returns public.agenda_blocks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.agenda_blocks%rowtype;
  v_prev_status text;
  v_prev_ends timestamptz;
  v_event_id uuid;
  v_msg text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active
  ) then
    raise exception 'PROFILE_INACTIVE';
  end if;

  select * into v_row from public.agenda_blocks where id = p_block_id for update;
  if not found then
    raise exception 'AGENDA_BLOCK_NOT_FOUND';
  end if;

  if v_row.status = 'cancelled' then
    raise exception 'AGENDA_BLOCK_CANCELLED';
  end if;

  if v_row.status = 'ended' then
    return v_row;
  end if;

  if not public.can_schedule_in_org(v_row.organization_id, v_row.practice_id) then
    raise exception 'FORBIDDEN';
  end if;

  v_prev_status := v_row.status;
  v_prev_ends := v_row.ends_at;

  update public.agenda_blocks
     set ends_at = case when ends_at > now() then now() else ends_at end,
         status = 'ended',
         ended_at = now(),
         ended_by = auth.uid(),
         updated_at = now(),
         updated_by = auth.uid()
   where id = p_block_id
  returning * into v_row;

  insert into public.agenda_block_revisions (
    block_id, organization_id, practice_id,
    previous_starts_at, previous_ends_at, next_starts_at, next_ends_at,
    previous_status, next_status, change_kind, note, created_by
  ) values (
    v_row.id, v_row.organization_id, v_row.practice_id,
    v_row.starts_at, v_prev_ends, v_row.starts_at, v_row.ends_at,
    v_prev_status, 'ended', 'end', null, auth.uid()
  );

  v_msg := 'Bloqueio operacional encerrado. Previsões serão recalculadas.';

  insert into public.operational_events (
    organization_id, practice_id, event_type, title, message,
    reference_type, reference_id, payload, created_by
  ) values (
    v_row.organization_id, v_row.practice_id, 'AGENDA_BLOCK_ENDED',
    'Alteração de agenda', v_msg,
    'agenda_block', v_row.id,
    jsonb_build_object('block_id', v_row.id),
    auth.uid()
  )
  returning id into v_event_id;

  perform public.agenda_block_notify_staff(
    v_row.organization_id, v_row.practice_id, v_event_id, 'AGENDA_BLOCK_ENDED',
    'Alteração de agenda', v_msg, 'agenda_block', v_row.id, v_row.professional_id
  );

  perform public.write_audit(
    'update'::public.audit_action,
    'agenda_blocks',
    v_row.id,
    v_row.practice_id,
    null,
    jsonb_build_object('rpc', 'agenda_block_end')
  );

  return v_row;
end;
$$;

create or replace function public.staff_notification_mark_read(p_notification_id uuid)
returns public.staff_notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.staff_notifications%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  update public.staff_notifications
     set read_at = coalesce(read_at, now())
   where id = p_notification_id
     and recipient_profile_id = auth.uid()
  returning * into v_row;

  if not found then
    raise exception 'NOTIFICATION_NOT_FOUND';
  end if;

  return v_row;
end;
$$;

create or replace function public.staff_notification_dismiss(p_notification_id uuid)
returns public.staff_notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.staff_notifications%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  update public.staff_notifications
     set dismissed_at = coalesce(dismissed_at, now()),
         read_at = coalesce(read_at, now())
   where id = p_notification_id
     and recipient_profile_id = auth.uid()
  returning * into v_row;

  if not found then
    raise exception 'NOTIFICATION_NOT_FOUND';
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) Privileges das RPCs
-- ---------------------------------------------------------------------------

revoke all on function public.agenda_block_create(jsonb) from public, anon;
revoke all on function public.agenda_block_update(jsonb) from public, anon;
revoke all on function public.agenda_block_cancel(uuid, text) from public, anon;
revoke all on function public.agenda_block_end(uuid) from public, anon;
revoke all on function public.staff_notification_mark_read(uuid) from public, anon;
revoke all on function public.staff_notification_dismiss(uuid) from public, anon;
revoke all on function public.agenda_block_notify_staff(uuid, uuid, uuid, text, text, text, text, uuid, uuid) from public, anon, authenticated;

grant execute on function public.agenda_block_create(jsonb) to authenticated;
grant execute on function public.agenda_block_update(jsonb) to authenticated;
grant execute on function public.agenda_block_cancel(uuid, text) to authenticated;
grant execute on function public.agenda_block_end(uuid) to authenticated;
grant execute on function public.staff_notification_mark_read(uuid) to authenticated;
grant execute on function public.staff_notification_dismiss(uuid) to authenticated;
