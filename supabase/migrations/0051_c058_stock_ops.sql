-- C058 — Operacionalização de Estoque sobre warehouses/items/stock_* (0001/0003).
-- Aditiva. NÃO aplica automaticamente (db push exige autorização expressa).
-- Livro único: stock_movements. Saldos atualizados atomicamente via RPCs.

-- ---------------------------------------------------------------------------
-- 1) Colunas operacionais em items / warehouses / movements
-- ---------------------------------------------------------------------------

alter table public.items
  add column if not exists description text,
  add column if not exists ideal_qty numeric(12, 3) not null default 0,
  add column if not exists reorder_qty numeric(12, 3),
  add column if not exists is_active boolean not null default true,
  add column if not exists notes text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists created_by uuid references public.profiles (id),
  add column if not exists updated_at timestamptz not null default now();

alter table public.items
  drop constraint if exists items_ideal_qty_chk;
alter table public.items
  add constraint items_ideal_qty_chk check (ideal_qty >= 0);

alter table public.items
  drop constraint if exists items_min_qty_nonneg;
alter table public.items
  add constraint items_min_qty_nonneg check (min_qty >= 0);

comment on column public.items.ideal_qty is 'C058: estoque ideal (meta de reposição).';
comment on column public.items.min_qty is 'C058: estoque mínimo — alerta quando saldo total <= min_qty.';

alter table public.warehouses
  add column if not exists is_active boolean not null default true,
  add column if not exists notes text,
  add column if not exists created_at timestamptz not null default now();

alter table public.stock_movements
  add column if not exists qty_before numeric(12, 3),
  add column if not exists qty_after numeric(12, 3),
  add column if not exists transfer_group_id uuid,
  add column if not exists reason text;

create index if not exists stock_movements_wh_time_idx
  on public.stock_movements (warehouse_id, occurred_at desc);

create index if not exists stock_movements_transfer_idx
  on public.stock_movements (transfer_group_id)
  where transfer_group_id is not null;

create index if not exists items_org_active_idx
  on public.items (organization_id, is_active, name);

-- stock_audit_lines: permitir múltiplas linhas (item+lote) por inventário
alter table public.stock_audit_lines
  drop constraint if exists stock_audit_lines_pkey;

alter table public.stock_audit_lines
  add column if not exists id uuid;

update public.stock_audit_lines
   set id = gen_random_uuid()
 where id is null;

alter table public.stock_audit_lines
  alter column id set default gen_random_uuid(),
  alter column id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'stock_audit_lines_pkey'
      and conrelid = 'public.stock_audit_lines'::regclass
  ) then
    alter table public.stock_audit_lines add primary key (id);
  end if;
end $$;

create unique index if not exists stock_audit_lines_item_lot_uidx
  on public.stock_audit_lines (
    audit_id,
    item_id,
    (coalesce(lot_id, '00000000-0000-4000-8000-000000000000'::uuid))
  );

alter table public.stock_audits
  add column if not exists status text not null default 'confirmed',
  add column if not exists confirmed_at timestamptz;

alter table public.stock_audits
  drop constraint if exists stock_audits_status_chk;
alter table public.stock_audits
  add constraint stock_audits_status_chk
  check (status in ('draft', 'confirmed', 'cancelled'));

-- ---------------------------------------------------------------------------
-- 2) Aplicação atômica de delta (lock + saldo + lote)
-- ---------------------------------------------------------------------------

create or replace function public.stock_apply_qty_delta(
  p_warehouse_id uuid,
  p_item_id uuid,
  p_lot_id uuid,
  p_delta numeric,
  p_lot_code text default null,
  p_expires_on date default null
)
returns table (qty_before numeric, qty_after numeric, lot_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before numeric(12, 3);
  v_after numeric(12, 3);
  v_lot uuid := p_lot_id;
  v_lot_qty numeric(12, 3);
  v_requires_lot boolean;
begin
  if p_delta is null or p_delta = 0 then
    raise exception 'STOCK_DELTA_INVALID';
  end if;

  select requires_lot into v_requires_lot from public.items where id = p_item_id for share;
  if not found then
    raise exception 'STOCK_ITEM_NOT_FOUND';
  end if;

  -- Lock saldo agregado
  insert into public.stock_balances (warehouse_id, item_id, qty_on_hand)
  values (p_warehouse_id, p_item_id, 0)
  on conflict (warehouse_id, item_id) do nothing;

  select sb.qty_on_hand into v_before
    from public.stock_balances sb
   where sb.warehouse_id = p_warehouse_id and sb.item_id = p_item_id
   for update;

  v_after := v_before + p_delta;
  if v_after < 0 then
    raise exception 'STOCK_INSUFFICIENT';
  end if;

  if v_requires_lot then
    if v_lot is null then
      if p_delta < 0 then
        raise exception 'STOCK_LOT_REQUIRED';
      end if;
      if nullif(btrim(coalesce(p_lot_code, '')), '') is null then
        raise exception 'STOCK_LOT_REQUIRED';
      end if;
      insert into public.item_lots (item_id, warehouse_id, lot_code, expires_on, qty_on_hand)
      values (p_item_id, p_warehouse_id, btrim(p_lot_code), p_expires_on, 0)
      on conflict (item_id, warehouse_id, lot_code) do nothing
      returning id into v_lot;
      if v_lot is null then
        select id into v_lot
          from public.item_lots
         where item_id = p_item_id
           and warehouse_id = p_warehouse_id
           and lot_code = btrim(p_lot_code)
         for update;
      else
        perform 1 from public.item_lots where id = v_lot for update;
      end if;
      if p_expires_on is not null then
        update public.item_lots set expires_on = coalesce(expires_on, p_expires_on)
         where id = v_lot and expires_on is null;
      end if;
    else
      select qty_on_hand into v_lot_qty
        from public.item_lots
       where id = v_lot and item_id = p_item_id and warehouse_id = p_warehouse_id
       for update;
      if not found then
        raise exception 'STOCK_LOT_NOT_FOUND';
      end if;
    end if;

    select qty_on_hand into v_lot_qty from public.item_lots where id = v_lot for update;
    if v_lot_qty + p_delta < 0 then
      raise exception 'STOCK_LOT_INSUFFICIENT';
    end if;
    update public.item_lots
       set qty_on_hand = qty_on_hand + p_delta
     where id = v_lot;
  elsif v_lot is not null then
    raise exception 'STOCK_LOT_NOT_ALLOWED';
  end if;

  update public.stock_balances
     set qty_on_hand = v_after
   where warehouse_id = p_warehouse_id and item_id = p_item_id;

  qty_before := v_before;
  qty_after := v_after;
  lot_id := v_lot;
  return next;
end;
$$;

revoke all on function public.stock_apply_qty_delta(uuid, uuid, uuid, numeric, text, date) from public;

-- ---------------------------------------------------------------------------
-- 3) Helpers de autorização
-- ---------------------------------------------------------------------------

create or replace function public.stock_assert_access(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_organization_id is null then
    raise exception 'STOCK_ORG_REQUIRED';
  end if;
  if not public.can_access_stock(p_organization_id) then
    raise exception 'FORBIDDEN';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) CRUD item / warehouse
-- ---------------------------------------------------------------------------

create or replace function public.stock_item_upsert(p_payload jsonb)
returns public.items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_org uuid := (p_payload->>'organization_id')::uuid;
  v_row public.items%rowtype;
  v_has_moves boolean;
begin
  perform public.stock_assert_access(v_org);

  if v_id is null then
    if nullif(btrim(coalesce(p_payload->>'sku', '')), '') is null
       or nullif(btrim(coalesce(p_payload->>'name', '')), '') is null then
      raise exception 'STOCK_ITEM_REQUIRED_FIELDS';
    end if;
    insert into public.items (
      organization_id, sku, name, item_class, unit, min_qty, ideal_qty, reorder_qty,
      description, notes, is_active, created_by, default_charge_target
    ) values (
      v_org,
      btrim(p_payload->>'sku'),
      btrim(p_payload->>'name'),
      coalesce(nullif(p_payload->>'item_class', '')::public.item_class, 'clinical_consumable'::public.item_class),
      coalesce(nullif(btrim(coalesce(p_payload->>'unit', '')), ''), 'un'),
      coalesce((p_payload->>'min_qty')::numeric, 0),
      coalesce((p_payload->>'ideal_qty')::numeric, 0),
      nullif(p_payload->>'reorder_qty', '')::numeric,
      nullif(btrim(coalesce(p_payload->>'description', '')), ''),
      nullif(btrim(coalesce(p_payload->>'notes', '')), ''),
      coalesce((p_payload->>'is_active')::boolean, true),
      auth.uid(),
      coalesce(nullif(p_payload->>'default_charge_target', '')::public.charge_target, 'none'::public.charge_target)
    )
    returning * into v_row;

    perform public.write_audit(
      'insert', 'items', v_row.id, null, null,
      jsonb_build_object('rpc', 'stock_item_upsert', 'sku', v_row.sku)
    );
    return v_row;
  end if;

  select * into v_row from public.items where id = v_id for update;
  if not found or v_row.organization_id is distinct from v_org then
    raise exception 'STOCK_ITEM_NOT_FOUND';
  end if;
  perform public.stock_assert_access(v_row.organization_id);

  select exists(
    select 1 from public.stock_movements m where m.item_id = v_id limit 1
  ) into v_has_moves;

  if v_has_moves
     and p_payload ? 'unit'
     and nullif(btrim(coalesce(p_payload->>'unit', '')), '') is distinct from v_row.unit then
    raise exception 'STOCK_UNIT_LOCKED';
  end if;

  update public.items set
    name = coalesce(nullif(btrim(coalesce(p_payload->>'name', '')), ''), name),
    sku = coalesce(nullif(btrim(coalesce(p_payload->>'sku', '')), ''), sku),
    item_class = coalesce(nullif(p_payload->>'item_class', '')::public.item_class, item_class),
    unit = case when v_has_moves then unit
                else coalesce(nullif(btrim(coalesce(p_payload->>'unit', '')), ''), unit) end,
    min_qty = coalesce((p_payload->>'min_qty')::numeric, min_qty),
    ideal_qty = coalesce((p_payload->>'ideal_qty')::numeric, ideal_qty),
    reorder_qty = case when p_payload ? 'reorder_qty'
      then nullif(p_payload->>'reorder_qty', '')::numeric else reorder_qty end,
    description = case when p_payload ? 'description'
      then nullif(btrim(coalesce(p_payload->>'description', '')), '') else description end,
    notes = case when p_payload ? 'notes'
      then nullif(btrim(coalesce(p_payload->>'notes', '')), '') else notes end,
    is_active = coalesce((p_payload->>'is_active')::boolean, is_active),
    updated_at = now()
  where id = v_id
  returning * into v_row;

  perform public.write_audit(
    'update', 'items', v_row.id, null, null,
    jsonb_build_object('rpc', 'stock_item_upsert', 'sku', v_row.sku)
  );
  return v_row;
end;
$$;

create or replace function public.stock_warehouse_upsert(p_payload jsonb)
returns public.warehouses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_org uuid := (p_payload->>'organization_id')::uuid;
  v_row public.warehouses%rowtype;
begin
  perform public.stock_assert_access(v_org);

  if v_id is null then
    insert into public.warehouses (
      organization_id, code, name, room_id, handles_clinical, handles_pantry, is_active, notes
    ) values (
      v_org,
      nullif(btrim(coalesce(p_payload->>'code', '')), ''),
      nullif(btrim(coalesce(p_payload->>'name', '')), ''),
      nullif(p_payload->>'room_id', '')::uuid,
      coalesce((p_payload->>'handles_clinical')::boolean, false),
      coalesce((p_payload->>'handles_pantry')::boolean, true),
      coalesce((p_payload->>'is_active')::boolean, true),
      nullif(btrim(coalesce(p_payload->>'notes', '')), '')
    )
    returning * into v_row;
    if v_row.code is null or v_row.name is null then
      raise exception 'STOCK_WAREHOUSE_REQUIRED_FIELDS';
    end if;
    perform public.write_audit(
      'insert', 'warehouses', v_row.id, null, null,
      jsonb_build_object('rpc', 'stock_warehouse_upsert', 'code', v_row.code)
    );
    return v_row;
  end if;

  select * into v_row from public.warehouses where id = v_id for update;
  if not found or v_row.organization_id is distinct from v_org then
    raise exception 'STOCK_WAREHOUSE_NOT_FOUND';
  end if;

  update public.warehouses set
    name = coalesce(nullif(btrim(coalesce(p_payload->>'name', '')), ''), name),
    code = coalesce(nullif(btrim(coalesce(p_payload->>'code', '')), ''), code),
    room_id = case when p_payload ? 'room_id'
      then nullif(p_payload->>'room_id', '')::uuid else room_id end,
    handles_clinical = coalesce((p_payload->>'handles_clinical')::boolean, handles_clinical),
    handles_pantry = coalesce((p_payload->>'handles_pantry')::boolean, handles_pantry),
    is_active = coalesce((p_payload->>'is_active')::boolean, is_active),
    notes = case when p_payload ? 'notes'
      then nullif(btrim(coalesce(p_payload->>'notes', '')), '') else notes end
  where id = v_id
  returning * into v_row;

  perform public.write_audit(
    'update', 'warehouses', v_row.id, null, null,
    jsonb_build_object('rpc', 'stock_warehouse_upsert', 'code', v_row.code)
  );
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Movimentações atômicas
-- ---------------------------------------------------------------------------

create or replace function public.stock_movement_receipt(p_payload jsonb)
returns public.stock_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := (p_payload->>'organization_id')::uuid;
  v_wh uuid := (p_payload->>'warehouse_id')::uuid;
  v_item uuid := (p_payload->>'item_id')::uuid;
  v_qty numeric := (p_payload->>'qty')::numeric;
  v_lot_code text := nullif(btrim(coalesce(p_payload->>'lot_code', '')), '');
  v_expires date := nullif(p_payload->>'expires_on', '')::date;
  v_note text := nullif(btrim(coalesce(p_payload->>'note', '')), '');
  v_reason text := nullif(btrim(coalesce(p_payload->>'reason', '')), '');
  v_bal record;
  v_row public.stock_movements%rowtype;
begin
  perform public.stock_assert_access(v_org);
  if v_wh is null or v_item is null or v_qty is null or v_qty <= 0 then
    raise exception 'STOCK_RECEIPT_REQUIRED_FIELDS';
  end if;
  if not exists (select 1 from public.warehouses where id = v_wh and organization_id = v_org and is_active) then
    raise exception 'STOCK_WAREHOUSE_NOT_FOUND';
  end if;
  if not exists (select 1 from public.items where id = v_item and organization_id = v_org and is_active) then
    raise exception 'STOCK_ITEM_NOT_FOUND';
  end if;

  select * into v_bal from public.stock_apply_qty_delta(v_wh, v_item, null, v_qty, v_lot_code, v_expires);

  insert into public.stock_movements (
    organization_id, warehouse_id, item_id, lot_id, kind, qty,
    qty_before, qty_after, occurred_at, created_by, note, reason
  ) values (
    v_org, v_wh, v_item, v_bal.lot_id, 'receipt'::public.movement_kind, v_qty,
    v_bal.qty_before, v_bal.qty_after, coalesce((p_payload->>'occurred_at')::timestamptz, now()),
    auth.uid(), v_note, v_reason
  )
  returning * into v_row;

  perform public.write_audit(
    'insert', 'stock_movements', v_row.id, null, null,
    jsonb_build_object('rpc', 'stock_movement_receipt', 'qty', v_qty, 'item_id', v_item)
  );
  return v_row;
end;
$$;

create or replace function public.stock_movement_exit(p_payload jsonb)
returns public.stock_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := (p_payload->>'organization_id')::uuid;
  v_wh uuid := (p_payload->>'warehouse_id')::uuid;
  v_item uuid := (p_payload->>'item_id')::uuid;
  v_qty numeric := (p_payload->>'qty')::numeric;
  v_lot uuid := nullif(p_payload->>'lot_id', '')::uuid;
  v_note text := nullif(btrim(coalesce(p_payload->>'note', '')), '');
  v_reason text := nullif(btrim(coalesce(p_payload->>'reason', '')), '');
  v_dest uuid := nullif(p_payload->>'destination_room_id', '')::uuid;
  v_bal record;
  v_row public.stock_movements%rowtype;
begin
  perform public.stock_assert_access(v_org);
  if v_wh is null or v_item is null or v_qty is null or v_qty <= 0 then
    raise exception 'STOCK_EXIT_REQUIRED_FIELDS';
  end if;
  if v_reason is null then
    raise exception 'STOCK_EXIT_REASON_REQUIRED';
  end if;

  select * into v_bal from public.stock_apply_qty_delta(v_wh, v_item, v_lot, -v_qty, null, null);

  insert into public.stock_movements (
    organization_id, warehouse_id, item_id, lot_id, kind, qty,
    qty_before, qty_after, destination_room_id, occurred_at, created_by, note, reason
  ) values (
    v_org, v_wh, v_item, v_bal.lot_id, 'pantry_consume'::public.movement_kind, -v_qty,
    v_bal.qty_before, v_bal.qty_after, v_dest,
    coalesce((p_payload->>'occurred_at')::timestamptz, now()),
    auth.uid(), v_note, v_reason
  )
  returning * into v_row;

  perform public.write_audit(
    'insert', 'stock_movements', v_row.id, null, null,
    jsonb_build_object('rpc', 'stock_movement_exit', 'qty', v_qty, 'item_id', v_item)
  );
  return v_row;
exception
  when raise_exception then
    raise;
end;
$$;

create or replace function public.stock_movement_transfer(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := (p_payload->>'organization_id')::uuid;
  v_from uuid := (p_payload->>'from_warehouse_id')::uuid;
  v_to uuid := (p_payload->>'to_warehouse_id')::uuid;
  v_item uuid := (p_payload->>'item_id')::uuid;
  v_qty numeric := (p_payload->>'qty')::numeric;
  v_lot uuid := nullif(p_payload->>'lot_id', '')::uuid;
  v_lot_code text;
  v_expires date;
  v_note text := nullif(btrim(coalesce(p_payload->>'note', '')), '');
  v_reason text := coalesce(nullif(btrim(coalesce(p_payload->>'reason', '')), ''), 'Transferência entre locais');
  v_group uuid := gen_random_uuid();
  v_out record;
  v_in record;
  v_out_row public.stock_movements%rowtype;
  v_in_row public.stock_movements%rowtype;
begin
  perform public.stock_assert_access(v_org);
  if v_from is null or v_to is null or v_item is null or v_qty is null or v_qty <= 0 then
    raise exception 'STOCK_TRANSFER_REQUIRED_FIELDS';
  end if;
  if v_from = v_to then
    raise exception 'STOCK_TRANSFER_SAME_WAREHOUSE';
  end if;
  if not exists (select 1 from public.warehouses where id = v_from and organization_id = v_org and is_active) then
    raise exception 'STOCK_WAREHOUSE_NOT_FOUND';
  end if;
  if not exists (select 1 from public.warehouses where id = v_to and organization_id = v_org and is_active) then
    raise exception 'STOCK_WAREHOUSE_NOT_FOUND';
  end if;

  -- lock order estável para evitar deadlock
  if v_from::text < v_to::text then
    perform 1 from public.stock_balances where warehouse_id = v_from and item_id = v_item for update;
    perform 1 from public.stock_balances where warehouse_id = v_to and item_id = v_item for update;
  else
    perform 1 from public.stock_balances where warehouse_id = v_to and item_id = v_item for update;
    perform 1 from public.stock_balances where warehouse_id = v_from and item_id = v_item for update;
  end if;

  if v_lot is not null then
    select lot_code, expires_on into v_lot_code, v_expires
      from public.item_lots where id = v_lot;
  end if;

  select * into v_out from public.stock_apply_qty_delta(v_from, v_item, v_lot, -v_qty, null, null);
  select * into v_in from public.stock_apply_qty_delta(
    v_to, v_item, null, v_qty, coalesce(v_lot_code, 'TRF-' || left(v_group::text, 8)), v_expires
  );

  insert into public.stock_movements (
    organization_id, warehouse_id, item_id, lot_id, kind, qty,
    qty_before, qty_after, transfer_group_id, occurred_at, created_by, note, reason
  ) values (
    v_org, v_from, v_item, v_out.lot_id, 'transfer'::public.movement_kind, -v_qty,
    v_out.qty_before, v_out.qty_after, v_group, now(), auth.uid(), v_note, v_reason
  )
  returning * into v_out_row;

  insert into public.stock_movements (
    organization_id, warehouse_id, item_id, lot_id, kind, qty,
    qty_before, qty_after, transfer_group_id, occurred_at, created_by, note, reason
  ) values (
    v_org, v_to, v_item, v_in.lot_id, 'transfer'::public.movement_kind, v_qty,
    v_in.qty_before, v_in.qty_after, v_group, now(), auth.uid(), v_note, v_reason
  )
  returning * into v_in_row;

  perform public.write_audit(
    'insert', 'stock_movements', v_out_row.id, null, null,
    jsonb_build_object(
      'rpc', 'stock_movement_transfer',
      'transfer_group_id', v_group,
      'from', v_from, 'to', v_to, 'qty', v_qty
    )
  );

  return jsonb_build_object(
    'transfer_group_id', v_group,
    'out_movement_id', v_out_row.id,
    'in_movement_id', v_in_row.id
  );
end;
$$;

create or replace function public.stock_movement_adjust(p_payload jsonb)
returns public.stock_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := (p_payload->>'organization_id')::uuid;
  v_wh uuid := (p_payload->>'warehouse_id')::uuid;
  v_item uuid := (p_payload->>'item_id')::uuid;
  v_delta numeric := (p_payload->>'delta')::numeric;
  v_lot uuid := nullif(p_payload->>'lot_id', '')::uuid;
  v_lot_code text := nullif(btrim(coalesce(p_payload->>'lot_code', '')), '');
  v_expires date := nullif(p_payload->>'expires_on', '')::date;
  v_reason text := nullif(btrim(coalesce(p_payload->>'reason', '')), '');
  v_note text := nullif(btrim(coalesce(p_payload->>'note', '')), '');
  v_bal record;
  v_row public.stock_movements%rowtype;
  v_kind public.movement_kind;
begin
  perform public.stock_assert_access(v_org);
  if v_wh is null or v_item is null or v_delta is null or v_delta = 0 then
    raise exception 'STOCK_ADJUST_REQUIRED_FIELDS';
  end if;
  if v_reason is null then
    raise exception 'STOCK_ADJUST_REASON_REQUIRED';
  end if;

  v_kind := case
    when coalesce((p_payload->>'expiry_writeoff')::boolean, false) then 'expiry_writeoff'::public.movement_kind
    else 'adjustment'::public.movement_kind
  end;

  select * into v_bal from public.stock_apply_qty_delta(
    v_wh, v_item, v_lot, v_delta,
    case when v_delta > 0 then v_lot_code else null end,
    v_expires
  );

  insert into public.stock_movements (
    organization_id, warehouse_id, item_id, lot_id, kind, qty,
    qty_before, qty_after, occurred_at, created_by, note, reason
  ) values (
    v_org, v_wh, v_item, v_bal.lot_id, v_kind, v_delta,
    v_bal.qty_before, v_bal.qty_after, now(), auth.uid(), v_note, v_reason
  )
  returning * into v_row;

  perform public.write_audit(
    'insert', 'stock_movements', v_row.id, null, null,
    jsonb_build_object('rpc', 'stock_movement_adjust', 'delta', v_delta, 'item_id', v_item)
  );
  return v_row;
end;
$$;

create or replace function public.stock_inventory_confirm(p_payload jsonb)
returns public.stock_audits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := (p_payload->>'organization_id')::uuid;
  v_wh uuid := (p_payload->>'warehouse_id')::uuid;
  v_notes text := nullif(btrim(coalesce(p_payload->>'notes', '')), '');
  v_lines jsonb := coalesce(p_payload->'lines', '[]'::jsonb);
  v_audit public.stock_audits%rowtype;
  v_line jsonb;
  v_item uuid;
  v_lot uuid;
  v_counted numeric;
  v_expected numeric;
  v_delta numeric;
begin
  perform public.stock_assert_access(v_org);
  if v_wh is null or jsonb_typeof(v_lines) <> 'array' or jsonb_array_length(v_lines) = 0 then
    raise exception 'STOCK_INVENTORY_REQUIRED_FIELDS';
  end if;

  insert into public.stock_audits (
    organization_id, warehouse_id, counted_by, counted_at, notes, status, confirmed_at
  ) values (
    v_org, v_wh, auth.uid(), now(), v_notes, 'confirmed', now()
  )
  returning * into v_audit;

  for v_line in select * from jsonb_array_elements(v_lines)
  loop
    v_item := (v_line->>'item_id')::uuid;
    v_lot := nullif(v_line->>'lot_id', '')::uuid;
    v_counted := (v_line->>'counted_qty')::numeric;
    if v_item is null or v_counted is null or v_counted < 0 then
      raise exception 'STOCK_INVENTORY_LINE_INVALID';
    end if;

    select coalesce(qty_on_hand, 0) into v_expected
      from public.stock_balances
     where warehouse_id = v_wh and item_id = v_item;
    v_expected := coalesce(v_expected, 0);

    -- se lote informado, expected = qty do lote
    if v_lot is not null then
      select coalesce(qty_on_hand, 0) into v_expected
        from public.item_lots where id = v_lot and warehouse_id = v_wh and item_id = v_item;
      v_expected := coalesce(v_expected, 0);
    end if;

    insert into public.stock_audit_lines (audit_id, item_id, lot_id, expected_qty, counted_qty)
    values (v_audit.id, v_item, v_lot, v_expected, v_counted);

    v_delta := v_counted - v_expected;
    if v_delta <> 0 then
      perform public.stock_movement_adjust(jsonb_build_object(
        'organization_id', v_org,
        'warehouse_id', v_wh,
        'item_id', v_item,
        'lot_id', v_lot,
        'delta', v_delta,
        'reason', 'Inventário ' || v_audit.id::text,
        'note', 'Ajuste automático de inventário'
      ));
    end if;
  end loop;

  perform public.write_audit(
    'insert', 'stock_audits', v_audit.id, null, null,
    jsonb_build_object('rpc', 'stock_inventory_confirm', 'lines', jsonb_array_length(v_lines))
  );
  return v_audit;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Grants
-- ---------------------------------------------------------------------------

revoke all on function public.stock_assert_access(uuid) from public;
revoke all on function public.stock_item_upsert(jsonb) from public;
revoke all on function public.stock_warehouse_upsert(jsonb) from public;
revoke all on function public.stock_movement_receipt(jsonb) from public;
revoke all on function public.stock_movement_exit(jsonb) from public;
revoke all on function public.stock_movement_transfer(jsonb) from public;
revoke all on function public.stock_movement_adjust(jsonb) from public;
revoke all on function public.stock_inventory_confirm(jsonb) from public;

grant execute on function public.stock_item_upsert(jsonb) to authenticated;
grant execute on function public.stock_warehouse_upsert(jsonb) to authenticated;
grant execute on function public.stock_movement_receipt(jsonb) to authenticated;
grant execute on function public.stock_movement_exit(jsonb) to authenticated;
grant execute on function public.stock_movement_transfer(jsonb) to authenticated;
grant execute on function public.stock_movement_adjust(jsonb) to authenticated;
grant execute on function public.stock_inventory_confirm(jsonb) to authenticated;
