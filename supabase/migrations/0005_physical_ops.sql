-- Mapa físico da Casa Florescer e contratos de locação por período.
-- 4 salas físicas: o schema comporta; NÃO semear classificação nesta migration.
-- rental_contracts é a fonte da verdade da locação (não rotativa).
-- Estoque permanece em stock_movements (0001); não criar segundo livro.

create type public.room_kind as enum (
  'house_consultorio',
  'sublet_consultorio',
  'pharmacy',
  'procedure',
  'reception'
);

create type public.rental_contract_status as enum (
  'scheduled',
  'active',
  'ended',
  'cancelled'
);

alter table public.rooms
  add column if not exists room_kind public.room_kind,
  add column if not exists sort_order integer not null default 0;

comment on column public.rooms.is_house is
  'true = consultório das proprietárias (GO). Preferir room_kind quando classificado.';
comment on column public.rooms.room_kind is
  'Classificação física opcional até o proprietário definir as 4 salas. Null = ainda não classificada.';

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
  status public.rental_contract_status not null default 'scheduled',
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

create index rental_contracts_room_idx on public.rental_contracts (room_id);

create unique index rental_contracts_one_active_per_room
  on public.rental_contracts (room_id)
  where (is_active and status in ('scheduled', 'active'));

alter table public.rental_contracts
  add constraint rental_contracts_room_no_overlap
  exclude using gist (
    room_id with =,
    daterange(starts_on, coalesce(ends_on, 'infinity'::date), '[]') with &&
  )
  where (status in ('scheduled', 'active'));

comment on constraint rental_contracts_room_no_overlap on public.rental_contracts is
  'Ocupação efetiva da sala: somente scheduled/active. daterange fechado [] — a mesma sala não admite dois contratos no mesmo dia. Períodos consecutivos (A.ends_on + 1 = B.starts_on) são permitidos. cancelled e ended não ocupam. ends_on NULL = prazo indeterminado (infinity) enquanto scheduled/active.';

comment on table public.rental_contracts is
  'Aluguel do consultório sublocado por período determinado. O valor mensal já inclui água, luz e internet.';

create or replace function public.ensure_rental_on_sublet()
returns trigger
language plpgsql
as $$
declare
  v_kind public.room_kind;
  v_room_org uuid;
  v_prof_org uuid;
begin
  select room_kind, organization_id into v_kind, v_room_org
  from public.rooms
  where id = new.room_id;

  if v_kind is distinct from 'sublet_consultorio' then
    raise exception 'Contrato de locação só pode ser ligado a consultório classificado como sublet_consultorio.';
  end if;

  if new.organization_id is distinct from v_room_org then
    raise exception 'Contrato e sala devem ser da mesma organização.';
  end if;

  if new.tenant_professional_id is not null then
    select organization_id into v_prof_org
    from public.professionals
    where id = new.tenant_professional_id;

    if v_prof_org is distinct from new.organization_id then
      raise exception 'Locatário profissional de outra organização.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists rental_contracts_sublet_only on public.rental_contracts;
create trigger rental_contracts_sublet_only
  before insert or update of room_id, organization_id, tenant_professional_id
  on public.rental_contracts
  for each row
  execute function public.ensure_rental_on_sublet();

create table public.rental_statements (
  id uuid primary key default gen_random_uuid(),
  rental_contract_id uuid not null references public.rental_contracts (id),
  competence date not null,
  rent_cents integer not null check (rent_cents >= 0),
  extras_cents integer not null default 0 check (extras_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  issued_at timestamptz not null default now(),
  unique (rental_contract_id, competence),
  check (total_cents = rent_cents + extras_cents)
);

comment on table public.rental_statements is
  'Extrato mensal do inquilino: aluguel (utilidades inclusas) + extras. total_cents = rent_cents + extras_cents.';

alter table public.invoices
  add column if not exists rental_contract_id uuid references public.rental_contracts (id);

alter table public.cost_allocations
  add column if not exists rental_contract_id uuid references public.rental_contracts (id);

create or replace function public.is_rental_tenant(p_professional_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.professionals pr
    where pr.id = p_professional_id
      and pr.profile_id = auth.uid()
  )
$$;

revoke all on function public.is_rental_tenant(uuid) from public;
grant execute on function public.is_rental_tenant(uuid) to authenticated;

alter table public.rental_contracts enable row level security;
alter table public.rental_statements enable row level security;

create policy rental_contracts_house on public.rental_contracts
  for all using (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  )
  with check (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  );

create policy rental_contracts_tenant_select on public.rental_contracts
  for select using (
    tenant_professional_id is not null
    and public.is_rental_tenant(tenant_professional_id)
  );

create policy rooms_select_tenant on public.rooms
  for select using (
    exists (
      select 1
      from public.rental_contracts c
      where c.room_id = rooms.id
        and c.tenant_professional_id is not null
        and public.is_rental_tenant(c.tenant_professional_id)
        and c.status in ('scheduled', 'active')
    )
  );

create policy rental_statements_house_select on public.rental_statements
  for select using (
    exists (
      select 1 from public.rental_contracts c
      where c.id = rental_contract_id
        and public.is_house_staff(c.organization_id, array['owner', 'admin']::public.app_role[])
    )
  );

create policy rental_statements_house_write on public.rental_statements
  for insert with check (
    exists (
      select 1 from public.rental_contracts c
      where c.id = rental_contract_id
        and public.is_house_staff(c.organization_id, array['owner', 'admin']::public.app_role[])
    )
  );

create policy rental_statements_house_update on public.rental_statements
  for update using (
    exists (
      select 1 from public.rental_contracts c
      where c.id = rental_contract_id
        and public.is_house_staff(c.organization_id, array['owner', 'admin']::public.app_role[])
    )
  )
  with check (
    exists (
      select 1 from public.rental_contracts c
      where c.id = rental_contract_id
        and public.is_house_staff(c.organization_id, array['owner', 'admin']::public.app_role[])
    )
  );

create policy rental_statements_tenant_select on public.rental_statements
  for select using (
    exists (
      select 1 from public.rental_contracts c
      where c.id = rental_contract_id
        and c.tenant_professional_id is not null
        and public.is_rental_tenant(c.tenant_professional_id)
    )
  );
