-- C057 — Operacionalização de Aluguéis/Contratos sobre rental_contracts (0005).
-- Aditiva. NÃO aplica automaticamente (db push exige autorização expressa).
-- Reutiliza rooms + professionals. Sem cadastro paralelo.

-- ---------------------------------------------------------------------------
-- 1) Colunas operacionais
-- ---------------------------------------------------------------------------

alter table public.rental_contracts
  add column if not exists contract_code text,
  add column if not exists renewed_from_id uuid references public.rental_contracts (id),
  add column if not exists created_by uuid references public.profiles (id),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists due_day smallint,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists ended_at timestamptz,
  add column if not exists end_reason text;

alter table public.rental_contracts
  drop constraint if exists rental_contracts_due_day_chk;

alter table public.rental_contracts
  add constraint rental_contracts_due_day_chk
  check (due_day is null or (due_day >= 1 and due_day <= 28));

comment on column public.rental_contracts.contract_code is
  'C057: identificador legível do contrato (ex. CF-ALUG-2026-0001).';
comment on column public.rental_contracts.renewed_from_id is
  'C057: contrato de origem quando este registro é uma renovação.';

create unique index if not exists rental_contracts_org_code_uidx
  on public.rental_contracts (organization_id, contract_code)
  where contract_code is not null;

create index if not exists rental_contracts_status_idx
  on public.rental_contracts (organization_id, status, starts_on);

create index if not exists rental_contracts_tenant_idx
  on public.rental_contracts (tenant_professional_id)
  where tenant_professional_id is not null;

-- Backfill códigos legados
do $$
declare
  org_rec record;
  row_rec record;
  seq int;
begin
  for org_rec in
    select organization_id
    from public.rental_contracts
    where contract_code is null
    group by organization_id
  loop
    seq := 0;
    for row_rec in
      select id
      from public.rental_contracts
      where organization_id = org_rec.organization_id
        and contract_code is null
      order by created_at, id
    loop
      seq := seq + 1;
      update public.rental_contracts
         set contract_code = 'CF-ALUG-LEGACY-' || lpad(seq::text, 4, '0')
       where id = row_rec.id;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Histórico administrativo
-- ---------------------------------------------------------------------------

create table if not exists public.rental_contract_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  contract_id uuid not null references public.rental_contracts (id) on delete cascade,
  event_kind text not null check (
    event_kind in (
      'created',
      'updated',
      'renewed',
      'ended',
      'cancelled',
      'status_sync'
    )
  ),
  actor_id uuid references public.profiles (id),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists rental_contract_events_contract_idx
  on public.rental_contract_events (contract_id, created_at desc);

alter table public.rental_contract_events enable row level security;

drop policy if exists rental_contract_events_house on public.rental_contract_events;
create policy rental_contract_events_house on public.rental_contract_events
  for all using (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  )
  with check (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  );

-- ---------------------------------------------------------------------------
-- 3) Helpers
-- ---------------------------------------------------------------------------

create or replace function public.rental_contract_next_code(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year text := to_char(timezone('America/Sao_Paulo', now()), 'YYYY');
  v_n int;
begin
  select coalesce(max(
    nullif(substring(contract_code from 'CF-ALUG-[0-9]{4}-([0-9]+)$'), '')::int
  ), 0) + 1
    into v_n
  from public.rental_contracts
  where organization_id = p_organization_id
    and contract_code ~ ('^CF-ALUG-' || v_year || '-[0-9]+$');

  return 'CF-ALUG-' || v_year || '-' || lpad(v_n::text, 4, '0');
end;
$$;

revoke all on function public.rental_contract_next_code(uuid) from public;
grant execute on function public.rental_contract_next_code(uuid) to authenticated;

create or replace function public.rental_contract_derive_status(
  p_starts_on date,
  p_ends_on date,
  p_current public.rental_contract_status
)
returns public.rental_contract_status
language sql
immutable
as $$
  select case
    when p_current = 'cancelled'::public.rental_contract_status then 'cancelled'::public.rental_contract_status
    when p_ends_on is not null and current_date > p_ends_on then 'ended'::public.rental_contract_status
    when current_date < p_starts_on then 'scheduled'::public.rental_contract_status
    else 'active'::public.rental_contract_status
  end;
$$;

-- ---------------------------------------------------------------------------
-- 4) RPCs
-- ---------------------------------------------------------------------------

create or replace function public.rental_contract_create(p_payload jsonb)
returns public.rental_contracts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := (p_payload->>'organization_id')::uuid;
  v_room uuid := (p_payload->>'room_id')::uuid;
  v_tenant uuid := nullif(p_payload->>'tenant_professional_id', '')::uuid;
  v_name text := nullif(btrim(coalesce(p_payload->>'tenant_name', '')), '');
  v_specialty text := nullif(btrim(coalesce(p_payload->>'tenant_specialty', '')), '');
  v_rent int := (p_payload->>'monthly_rent_cents')::int;
  v_starts date := (p_payload->>'starts_on')::date;
  v_ends date := nullif(p_payload->>'ends_on', '')::date;
  v_due int := nullif(p_payload->>'due_day', '')::int;
  v_notes text := nullif(btrim(coalesce(p_payload->>'notes', '')), '');
  v_renewed uuid := nullif(p_payload->>'renewed_from_id', '')::uuid;
  v_row public.rental_contracts%rowtype;
  v_status public.rental_contract_status;
  v_prof_name text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if v_org is null or v_room is null or v_starts is null or v_rent is null then
    raise exception 'RENTAL_CONTRACT_REQUIRED_FIELDS';
  end if;
  if v_rent < 0 then
    raise exception 'RENTAL_CONTRACT_INVALID_VALUE';
  end if;
  if v_ends is not null and v_ends < v_starts then
    raise exception 'RENTAL_CONTRACT_INVALID_RANGE';
  end if;
  if not public.is_house_staff(v_org, array['owner', 'admin']::public.app_role[]) then
    raise exception 'FORBIDDEN';
  end if;

  if v_tenant is not null and (v_name is null or v_specialty is null) then
    select p.full_name into v_prof_name
    from public.professionals pr
    join public.profiles p on p.id = pr.profile_id
    where pr.id = v_tenant;
    v_name := coalesce(v_name, v_prof_name, 'Locatário');
    v_specialty := coalesce(v_specialty, 'Não informada');
  end if;

  if v_name is null or v_specialty is null then
    raise exception 'RENTAL_CONTRACT_TENANT_REQUIRED';
  end if;

  v_status := public.rental_contract_derive_status(v_starts, v_ends, 'scheduled'::public.rental_contract_status);

  insert into public.rental_contracts (
    organization_id,
    room_id,
    tenant_professional_id,
    tenant_name,
    tenant_specialty,
    monthly_rent_cents,
    starts_on,
    ends_on,
    status,
    is_active,
    notes,
    contract_code,
    renewed_from_id,
    created_by,
    due_day
  ) values (
    v_org,
    v_room,
    v_tenant,
    v_name,
    v_specialty,
    v_rent,
    v_starts,
    v_ends,
    v_status,
    v_status in ('scheduled'::public.rental_contract_status, 'active'::public.rental_contract_status),
    v_notes,
    public.rental_contract_next_code(v_org),
    v_renewed,
    auth.uid(),
    v_due
  )
  returning * into v_row;

  insert into public.rental_contract_events (
    organization_id, contract_id, event_kind, actor_id, detail
  ) values (
    v_org, v_row.id, 'created', auth.uid(),
    jsonb_build_object(
      'contract_code', v_row.contract_code,
      'room_id', v_row.room_id,
      'renewed_from_id', v_renewed
    )
  );

  perform public.write_audit(
    'insert',
    'rental_contracts',
    v_row.id,
    null,
    null,
    jsonb_build_object(
      'rpc', 'rental_contract_create',
      'contract_code', v_row.contract_code,
      'organization_id', v_org
    )
  );

  return v_row;
exception
  when exclusion_violation then
    raise exception 'RENTAL_CONTRACT_ROOM_OVERLAP';
end;
$$;

create or replace function public.rental_contract_update(p_contract_id uuid, p_payload jsonb)
returns public.rental_contracts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.rental_contracts%rowtype;
  v_status public.rental_contract_status;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_row from public.rental_contracts where id = p_contract_id for update;
  if not found then
    raise exception 'RENTAL_CONTRACT_NOT_FOUND';
  end if;
  if not public.is_house_staff(v_row.organization_id, array['owner', 'admin']::public.app_role[]) then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.status in ('ended'::public.rental_contract_status, 'cancelled'::public.rental_contract_status) then
    raise exception 'RENTAL_CONTRACT_TERMINAL';
  end if;

  update public.rental_contracts set
    room_id = coalesce(nullif(p_payload->>'room_id', '')::uuid, room_id),
    tenant_professional_id = case
      when p_payload ? 'tenant_professional_id'
        then nullif(p_payload->>'tenant_professional_id', '')::uuid
      else tenant_professional_id
    end,
    tenant_name = coalesce(nullif(btrim(coalesce(p_payload->>'tenant_name', '')), ''), tenant_name),
    tenant_specialty = coalesce(nullif(btrim(coalesce(p_payload->>'tenant_specialty', '')), ''), tenant_specialty),
    monthly_rent_cents = coalesce((p_payload->>'monthly_rent_cents')::int, monthly_rent_cents),
    starts_on = coalesce((p_payload->>'starts_on')::date, starts_on),
    ends_on = case
      when p_payload ? 'ends_on' then nullif(p_payload->>'ends_on', '')::date
      else ends_on
    end,
    due_day = case
      when p_payload ? 'due_day' then nullif(p_payload->>'due_day', '')::int
      else due_day
    end,
    notes = case
      when p_payload ? 'notes' then nullif(btrim(coalesce(p_payload->>'notes', '')), '')
      else notes
    end,
    updated_at = now()
  where id = p_contract_id
  returning * into v_row;

  if v_row.ends_on is not null and v_row.ends_on < v_row.starts_on then
    raise exception 'RENTAL_CONTRACT_INVALID_RANGE';
  end if;

  v_status := public.rental_contract_derive_status(v_row.starts_on, v_row.ends_on, v_row.status);
  update public.rental_contracts
     set status = v_status,
         is_active = v_status in ('scheduled'::public.rental_contract_status, 'active'::public.rental_contract_status),
         updated_at = now()
   where id = v_row.id
  returning * into v_row;

  insert into public.rental_contract_events (
    organization_id, contract_id, event_kind, actor_id, detail
  ) values (
    v_row.organization_id, v_row.id, 'updated', auth.uid(), coalesce(p_payload, '{}'::jsonb)
  );

  perform public.write_audit(
    'update',
    'rental_contracts',
    v_row.id,
    null,
    null,
    jsonb_build_object('rpc', 'rental_contract_update', 'contract_code', v_row.contract_code)
  );

  return v_row;
exception
  when exclusion_violation then
    raise exception 'RENTAL_CONTRACT_ROOM_OVERLAP';
end;
$$;

create or replace function public.rental_contract_end(
  p_contract_id uuid,
  p_reason text default null
)
returns public.rental_contracts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.rental_contracts%rowtype;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_row from public.rental_contracts where id = p_contract_id for update;
  if not found then raise exception 'RENTAL_CONTRACT_NOT_FOUND'; end if;
  if not public.is_house_staff(v_row.organization_id, array['owner', 'admin']::public.app_role[]) then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.status = 'cancelled'::public.rental_contract_status then
    raise exception 'RENTAL_CONTRACT_TERMINAL';
  end if;
  if v_row.status = 'ended'::public.rental_contract_status then
    return v_row;
  end if;

  update public.rental_contracts
     set status = 'ended'::public.rental_contract_status,
         is_active = false,
         ended_at = now(),
         end_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         ends_on = coalesce(ends_on, current_date),
         updated_at = now()
   where id = p_contract_id
  returning * into v_row;

  insert into public.rental_contract_events (
    organization_id, contract_id, event_kind, actor_id, detail
  ) values (
    v_row.organization_id, v_row.id, 'ended', auth.uid(),
    jsonb_build_object('reason', v_row.end_reason)
  );

  perform public.write_audit(
    'update', 'rental_contracts', v_row.id, null, null,
    jsonb_build_object('rpc', 'rental_contract_end', 'contract_code', v_row.contract_code)
  );
  return v_row;
end;
$$;

create or replace function public.rental_contract_cancel(
  p_contract_id uuid,
  p_reason text default null
)
returns public.rental_contracts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.rental_contracts%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_row from public.rental_contracts where id = p_contract_id for update;
  if not found then raise exception 'RENTAL_CONTRACT_NOT_FOUND'; end if;
  if not public.is_house_staff(v_row.organization_id, array['owner', 'admin']::public.app_role[]) then
    raise exception 'FORBIDDEN';
  end if;
  if v_row.status = 'cancelled'::public.rental_contract_status then
    return v_row;
  end if;
  if v_reason is null then
    raise exception 'RENTAL_CONTRACT_CANCEL_REASON_REQUIRED';
  end if;

  update public.rental_contracts
     set status = 'cancelled'::public.rental_contract_status,
         is_active = false,
         cancelled_at = now(),
         cancel_reason = v_reason,
         updated_at = now()
   where id = p_contract_id
  returning * into v_row;

  insert into public.rental_contract_events (
    organization_id, contract_id, event_kind, actor_id, detail
  ) values (
    v_row.organization_id, v_row.id, 'cancelled', auth.uid(),
    jsonb_build_object('reason', v_row.cancel_reason)
  );

  perform public.write_audit(
    'update', 'rental_contracts', v_row.id, null, null,
    jsonb_build_object('rpc', 'rental_contract_cancel', 'contract_code', v_row.contract_code)
  );
  return v_row;
end;
$$;

create or replace function public.rental_contract_renew(
  p_contract_id uuid,
  p_starts_on date,
  p_ends_on date,
  p_monthly_rent_cents int default null
)
returns public.rental_contracts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src public.rental_contracts%rowtype;
  v_new public.rental_contracts%rowtype;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_src from public.rental_contracts where id = p_contract_id for update;
  if not found then raise exception 'RENTAL_CONTRACT_NOT_FOUND'; end if;
  if not public.is_house_staff(v_src.organization_id, array['owner', 'admin']::public.app_role[]) then
    raise exception 'FORBIDDEN';
  end if;
  if p_starts_on is null then raise exception 'RENTAL_CONTRACT_REQUIRED_FIELDS'; end if;
  if p_ends_on is not null and p_ends_on < p_starts_on then
    raise exception 'RENTAL_CONTRACT_INVALID_RANGE';
  end if;

  -- Encerra origem se ainda ocupava a sala
  if v_src.status in ('scheduled'::public.rental_contract_status, 'active'::public.rental_contract_status) then
    perform public.rental_contract_end(v_src.id, 'Renovação — contrato substituído');
  end if;

  v_new := public.rental_contract_create(
    jsonb_build_object(
      'organization_id', v_src.organization_id,
      'room_id', v_src.room_id,
      'tenant_professional_id', v_src.tenant_professional_id,
      'tenant_name', v_src.tenant_name,
      'tenant_specialty', v_src.tenant_specialty,
      'monthly_rent_cents', coalesce(p_monthly_rent_cents, v_src.monthly_rent_cents),
      'starts_on', p_starts_on,
      'ends_on', p_ends_on,
      'due_day', v_src.due_day,
      'notes', v_src.notes,
      'renewed_from_id', v_src.id
    )
  );

  insert into public.rental_contract_events (
    organization_id, contract_id, event_kind, actor_id, detail
  ) values (
    v_src.organization_id, v_src.id, 'renewed', auth.uid(),
    jsonb_build_object('new_contract_id', v_new.id, 'new_contract_code', v_new.contract_code)
  );

  return v_new;
end;
$$;

revoke all on function public.rental_contract_create(jsonb) from public;
revoke all on function public.rental_contract_update(uuid, jsonb) from public;
revoke all on function public.rental_contract_end(uuid, text) from public;
revoke all on function public.rental_contract_cancel(uuid, text) from public;
revoke all on function public.rental_contract_renew(uuid, date, date, int) from public;

grant execute on function public.rental_contract_create(jsonb) to authenticated;
grant execute on function public.rental_contract_update(uuid, jsonb) to authenticated;
grant execute on function public.rental_contract_end(uuid, text) to authenticated;
grant execute on function public.rental_contract_cancel(uuid, text) to authenticated;
grant execute on function public.rental_contract_renew(uuid, date, date, int) to authenticated;
