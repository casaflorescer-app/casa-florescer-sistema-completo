-- Mapa físico da Casa Florescer, contratos de sublocação (aluguel com utilidades)
-- e movimentação de estoque por setor, sob a gestora/secretária.

create type public.room_kind as enum (
  'house_consultorio',
  'sublet_consultorio',
  'pharmacy',
  'procedure',
  'reception'
);

create type public.inventory_direction as enum ('in', 'out');

alter table public.rooms
  add column if not exists room_kind public.room_kind not null default 'sublet_consultorio',
  add column if not exists sort_order integer not null default 0;

comment on column public.rooms.is_house is
  'true = consultório das proprietárias (GO). Preferir room_kind para o mapa físico.';
comment on column public.rooms.room_kind is
  'house_consultorio | sublet_consultorio | pharmacy | procedure | reception';

create table public.rental_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  room_id uuid not null references public.rooms (id),
  tenant_professional_id uuid references public.professionals (id),
  tenant_name text not null,
  tenant_specialty text not null,
  monthly_rent_cents integer not null check (monthly_rent_cents >= 0),
  water_included boolean not null default true,
  electricity_included boolean not null default true,
  internet_included boolean not null default true,
  starts_on date not null,
  ends_on date,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create index rental_contracts_room_idx on public.rental_contracts (room_id);
create unique index rental_contracts_one_active_per_room
  on public.rental_contracts (room_id)
  where (is_active);

create or replace function public.ensure_rental_on_sublet()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.rooms r
    where r.id = new.room_id
      and r.room_kind = 'sublet_consultorio'
  ) then
    raise exception 'Contrato de sublocação só pode ser ligado a consultório sublocado.';
  end if;
  return new;
end;
$$;

drop trigger if exists rental_contracts_sublet_only on public.rental_contracts;
create trigger rental_contracts_sublet_only
  before insert or update of room_id
  on public.rental_contracts
  for each row
  execute function public.ensure_rental_on_sublet();

comment on table public.rental_contracts is
  'Aluguel do consultório sublocado. O valor mensal já inclui água, luz e internet.';

create table public.rental_statements (
  id uuid primary key default gen_random_uuid(),
  rental_contract_id uuid not null references public.rental_contracts (id),
  competence date not null,
  rent_cents integer not null check (rent_cents >= 0),
  extras_cents integer not null default 0 check (extras_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  issued_at timestamptz not null default now(),
  unique (rental_contract_id, competence)
);

comment on table public.rental_statements is
  'Extrato mensal unificado do inquilino: aluguel (utilidades inclusas) + extras eventuais.';

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  item_id uuid not null references public.items (id),
  qty numeric(12, 3) not null check (qty > 0),
  direction public.inventory_direction not null,
  destination_room_id uuid not null references public.rooms (id),
  encounter_id uuid references public.encounters (id),
  professional_id uuid references public.professionals (id),
  supervised_by uuid not null references public.profiles (id),
  occurred_at timestamptz not null default now(),
  note text
);

create index inventory_movements_room_time_idx
  on public.inventory_movements (destination_room_id, occurred_at desc);

comment on table public.inventory_movements is
  'Entrada/saída de insumos por setor (medicamentos, procedimentos, recepção). Gestora supervisiona.';

alter table public.rental_contracts enable row level security;
alter table public.rental_statements enable row level security;
alter table public.inventory_movements enable row level security;

create policy rental_contracts_ops on public.rental_contracts
  for all using (
    exists (
      select 1 from public.user_practice_roles r
      where r.user_id = auth.uid()
        and r.role in ('owner', 'admin', 'secretary')
    )
  )
  with check (
    exists (
      select 1 from public.user_practice_roles r
      where r.user_id = auth.uid()
        and r.role in ('owner', 'admin', 'secretary')
    )
  );

create policy rental_statements_ops on public.rental_statements
  for select using (
    exists (
      select 1 from public.user_practice_roles r
      where r.user_id = auth.uid()
        and r.role in ('owner', 'admin', 'secretary')
    )
  );

create policy inventory_movements_ops on public.inventory_movements
  for all using (
    exists (
      select 1 from public.user_practice_roles r
      where r.user_id = auth.uid()
        and r.role in ('owner', 'admin', 'secretary', 'inventory')
    )
  )
  with check (
    exists (
      select 1 from public.user_practice_roles r
      where r.user_id = auth.uid()
        and r.role in ('owner', 'admin', 'secretary', 'inventory')
    )
  );
