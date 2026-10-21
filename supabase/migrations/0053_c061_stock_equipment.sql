-- C061 — Classificação de materiais + equipamentos patrimoniais.
-- Evolução do C058 (0051). Aditiva. NÃO aplica automaticamente (db push exige autorização).
-- Equipamento ≠ material consumível (não usa qty de items).

-- ---------------------------------------------------------------------------
-- 1) Novas classes de item (consumíveis)
-- ---------------------------------------------------------------------------

alter type public.item_class add value if not exists 'surgical_consumable';
alter type public.item_class add value if not exists 'procedure_consumable';

comment on type public.item_class is
  'C061: clinical_lot_controlled=medicamentos; surgical/procedure_consumable=materiais; pantry=alimentos; housekeeping/office=gerais; clinical_consumable=legado clínico.';

-- ---------------------------------------------------------------------------
-- 2) Equipamentos (patrimônio individual)
-- ---------------------------------------------------------------------------

create table if not exists public.clinic_equipment (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null,
  category text not null default 'geral',
  manufacturer text,
  model text,
  serial_number text,
  asset_tag text,
  acquired_on date,
  room_id uuid references public.rooms (id),
  status text not null default 'active'
    check (status in ('active', 'maintenance', 'inactive', 'disposed', 'transferred')),
  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_equipment_name_chk check (char_length(btrim(name)) >= 2)
);

create unique index if not exists clinic_equipment_org_asset_uidx
  on public.clinic_equipment (organization_id, asset_tag)
  where asset_tag is not null and btrim(asset_tag) <> '';

create unique index if not exists clinic_equipment_org_serial_uidx
  on public.clinic_equipment (organization_id, serial_number)
  where serial_number is not null and btrim(serial_number) <> '';

create index if not exists clinic_equipment_org_status_idx
  on public.clinic_equipment (organization_id, status, name);

create index if not exists clinic_equipment_room_idx
  on public.clinic_equipment (room_id)
  where room_id is not null;

comment on table public.clinic_equipment is
  'C061: equipamento/patrimônio. Distinto de items (estoque consumível).';

create table if not exists public.clinic_equipment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  equipment_id uuid not null references public.clinic_equipment (id) on delete cascade,
  event_kind text not null check (
    event_kind in ('created', 'updated', 'transferred', 'status_changed', 'disposed')
  ),
  actor_id uuid references public.profiles (id),
  from_room_id uuid references public.rooms (id),
  to_room_id uuid references public.rooms (id),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists clinic_equipment_events_equip_idx
  on public.clinic_equipment_events (equipment_id, created_at desc);

alter table public.clinic_equipment enable row level security;
alter table public.clinic_equipment_events enable row level security;

drop policy if exists clinic_equipment_stock on public.clinic_equipment;
create policy clinic_equipment_stock on public.clinic_equipment
  for all using (public.can_access_stock(organization_id))
  with check (public.can_access_stock(organization_id));

drop policy if exists clinic_equipment_events_stock on public.clinic_equipment_events;
create policy clinic_equipment_events_stock on public.clinic_equipment_events
  for all using (public.can_access_stock(organization_id))
  with check (public.can_access_stock(organization_id));

-- ---------------------------------------------------------------------------
-- 3) RPCs
-- ---------------------------------------------------------------------------

create or replace function public.clinic_equipment_upsert(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := (p_payload->>'organization_id')::uuid;
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_name text := btrim(coalesce(p_payload->>'name', ''));
  v_room uuid := nullif(p_payload->>'room_id', '')::uuid;
  v_status text := coalesce(nullif(p_payload->>'status', ''), 'active');
  v_prev_room uuid;
begin
  if v_org is null or not public.can_access_stock(v_org) then
    raise exception 'EQUIPMENT_FORBIDDEN' using errcode = '42501';
  end if;
  if char_length(v_name) < 2 then
    raise exception 'EQUIPMENT_NAME_REQUIRED' using errcode = '22023';
  end if;
  if v_status not in ('active', 'maintenance', 'inactive', 'disposed', 'transferred') then
    raise exception 'EQUIPMENT_STATUS_INVALID' using errcode = '22023';
  end if;
  if v_room is not null and not exists (
    select 1 from public.rooms r where r.id = v_room and r.organization_id = v_org
  ) then
    raise exception 'EQUIPMENT_ROOM_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_id is null then
    insert into public.clinic_equipment (
      organization_id, name, category, manufacturer, model, serial_number, asset_tag,
      acquired_on, room_id, status, notes, created_by
    ) values (
      v_org,
      v_name,
      coalesce(nullif(btrim(p_payload->>'category'), ''), 'geral'),
      nullif(btrim(coalesce(p_payload->>'manufacturer', '')), ''),
      nullif(btrim(coalesce(p_payload->>'model', '')), ''),
      nullif(btrim(coalesce(p_payload->>'serial_number', '')), ''),
      nullif(btrim(coalesce(p_payload->>'asset_tag', '')), ''),
      nullif(p_payload->>'acquired_on', '')::date,
      v_room,
      v_status,
      nullif(btrim(coalesce(p_payload->>'notes', '')), ''),
      public.current_profile_id()
    )
    returning id into v_id;

    insert into public.clinic_equipment_events (
      organization_id, equipment_id, event_kind, actor_id, to_room_id, detail
    ) values (
      v_org, v_id, 'created', public.current_profile_id(), v_room,
      jsonb_build_object('name', v_name, 'source', 'c061')
    );

    perform public.write_audit(
      'insert'::public.audit_action,
      'clinic_equipment',
      v_id,
      null,
      null,
      jsonb_build_object('name', v_name, 'source', 'c061')
    );
  else
    select room_id into v_prev_room
    from public.clinic_equipment
    where id = v_id and organization_id = v_org;
    if not found then
      raise exception 'EQUIPMENT_NOT_FOUND' using errcode = 'P0002';
    end if;

    update public.clinic_equipment
       set name = v_name,
           category = coalesce(nullif(btrim(p_payload->>'category'), ''), category),
           manufacturer = case when p_payload ? 'manufacturer' then nullif(btrim(coalesce(p_payload->>'manufacturer', '')), '') else manufacturer end,
           model = case when p_payload ? 'model' then nullif(btrim(coalesce(p_payload->>'model', '')), '') else model end,
           serial_number = case when p_payload ? 'serial_number' then nullif(btrim(coalesce(p_payload->>'serial_number', '')), '') else serial_number end,
           asset_tag = case when p_payload ? 'asset_tag' then nullif(btrim(coalesce(p_payload->>'asset_tag', '')), '') else asset_tag end,
           acquired_on = case when p_payload ? 'acquired_on' then nullif(p_payload->>'acquired_on', '')::date else acquired_on end,
           room_id = case when p_payload ? 'room_id' then v_room else room_id end,
           status = v_status,
           notes = case when p_payload ? 'notes' then nullif(btrim(coalesce(p_payload->>'notes', '')), '') else notes end,
           updated_at = now()
     where id = v_id and organization_id = v_org;

    insert into public.clinic_equipment_events (
      organization_id, equipment_id, event_kind, actor_id, from_room_id, to_room_id, detail
    ) values (
      v_org, v_id, 'updated', public.current_profile_id(), v_prev_room,
      case when p_payload ? 'room_id' then v_room else v_prev_room end,
      jsonb_build_object('status', v_status, 'source', 'c061')
    );

    perform public.write_audit(
      'update'::public.audit_action,
      'clinic_equipment',
      v_id,
      null,
      null,
      jsonb_build_object('status', v_status, 'source', 'c061')
    );
  end if;
  return v_id;
end;
$$;

create or replace function public.clinic_equipment_transfer(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := (p_payload->>'organization_id')::uuid;
  v_id uuid := (p_payload->>'id')::uuid;
  v_to uuid := nullif(p_payload->>'to_room_id', '')::uuid;
  v_from uuid;
begin
  if v_org is null or v_id is null or not public.can_access_stock(v_org) then
    raise exception 'EQUIPMENT_FORBIDDEN' using errcode = '42501';
  end if;
  if v_to is not null and not exists (
    select 1 from public.rooms r where r.id = v_to and r.organization_id = v_org
  ) then
    raise exception 'EQUIPMENT_ROOM_NOT_FOUND' using errcode = 'P0002';
  end if;

  select room_id into v_from
  from public.clinic_equipment
  where id = v_id and organization_id = v_org and status in ('active', 'maintenance', 'inactive', 'transferred');
  if not found then
    raise exception 'EQUIPMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_from is not distinct from v_to then
    raise exception 'EQUIPMENT_TRANSFER_SAME_ROOM' using errcode = '22023';
  end if;

  update public.clinic_equipment
     set room_id = v_to,
         status = case when status = 'disposed' then status else 'active' end,
         updated_at = now()
   where id = v_id and organization_id = v_org;

  insert into public.clinic_equipment_events (
    organization_id, equipment_id, event_kind, actor_id, from_room_id, to_room_id, detail
  ) values (
    v_org, v_id, 'transferred', public.current_profile_id(), v_from, v_to,
    jsonb_build_object(
      'reason', nullif(btrim(coalesce(p_payload->>'reason', '')), ''),
      'source', 'c061'
    )
  );

  perform public.write_audit(
    'update'::public.audit_action,
    'clinic_equipment',
    v_id,
    null,
    null,
    jsonb_build_object('op', 'transfer', 'from_room_id', v_from, 'to_room_id', v_to, 'source', 'c061')
  );
  return v_id;
end;
$$;

revoke all on function public.clinic_equipment_upsert(jsonb) from public;
revoke all on function public.clinic_equipment_transfer(jsonb) from public;
grant execute on function public.clinic_equipment_upsert(jsonb) to authenticated;
grant execute on function public.clinic_equipment_transfer(jsonb) to authenticated;

grant select, insert, update, delete on public.clinic_equipment to authenticated;
grant select, insert, update, delete on public.clinic_equipment_events to authenticated;
