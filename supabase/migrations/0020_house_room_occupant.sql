-- COMMIT 028 / Migration 0020 — titularidade estrutural das salas próprias
--
-- rooms.occupant_professional_id = profissional titular de um consultório da casa.
-- Locação continua em rental_contracts.tenant_professional_id.
-- Sala compartilhada, farmácia, recepção e consultório locado permanecem sem titular.
--
-- Não altera contratos, agenda, UAT, RLS obstétrico nem RPCs clínicas.

alter table public.rooms
  add column if not exists occupant_professional_id uuid;

comment on column public.rooms.occupant_professional_id is
  'Titular de consultório da casa (room_kind = house_consultorio). Nulo nas salas locadas e na sala compartilhada.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rooms_occupant_professional_id_fkey'
      and conrelid = 'public.rooms'::regclass
  ) then
    alter table public.rooms
      add constraint rooms_occupant_professional_id_fkey
      foreign key (occupant_professional_id)
      references public.professionals (id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rooms_occupant_only_house_consultorio'
      and conrelid = 'public.rooms'::regclass
  ) then
    alter table public.rooms
      add constraint rooms_occupant_only_house_consultorio
      check (
        occupant_professional_id is null
        or room_kind = 'house_consultorio'
      );
  end if;
end $$;

create unique index if not exists rooms_one_active_house_occupant_idx
  on public.rooms (occupant_professional_id)
  where occupant_professional_id is not null
    and status = 'active';

create or replace function public.rooms_enforce_house_occupant()
returns trigger
language plpgsql
as $$
declare
  v_active boolean;
  v_org uuid;
begin
  if new.occupant_professional_id is null then
    return new;
  end if;

  if new.room_kind is distinct from 'house_consultorio' then
    raise exception 'Titular só pode ser definido em consultório da casa.';
  end if;

  select p.is_active, pr.organization_id
    into v_active, v_org
  from public.professionals pr
  join public.profiles p on p.id = pr.profile_id
  where pr.id = new.occupant_professional_id;

  if not found then
    raise exception 'Profissional titular não encontrado.';
  end if;

  if v_org is distinct from new.organization_id then
    raise exception 'Titular deve pertencer à mesma organização da sala.';
  end if;

  if v_active is not true then
    raise exception 'Profissional inativo não pode ser titular de sala própria.';
  end if;

  return new;
end;
$$;

drop trigger if exists rooms_enforce_house_occupant on public.rooms;
create trigger rooms_enforce_house_occupant
  before insert or update of occupant_professional_id, room_kind, organization_id, status
  on public.rooms
  for each row
  execute function public.rooms_enforce_house_occupant();

-- Preenche somente Sala 01 e Sala 02, pelos profissionais já identificados.
-- Interrompe se o identificador não for exatamente a titular esperada,
-- ou se houver mais de uma profissional com o mesmo nome na organização.
do $$
declare
  v_org uuid := '22e69ed4-0797-4742-b00e-f625317c6931';
  v_samara uuid := 'acbb0eb6-2994-49c2-b083-63e4382f3f2c';
  v_thais uuid := 'e3444eb1-9817-4659-96bd-9cd1d08f783c';
  v_name text;
  v_active boolean;
  v_count integer;
  v_updated integer;
begin
  if (select count(*) from public.organizations where id = v_org) <> 1 then
    raise exception 'ORGANIZATION_NOT_FOUND';
  end if;

  select p.full_name, p.is_active
    into v_name, v_active
  from public.professionals pr
  join public.profiles p on p.id = pr.profile_id
  where pr.id = v_samara
    and pr.organization_id = v_org;

  select count(*)
    into v_count
  from public.professionals pr
  join public.profiles p on p.id = pr.profile_id
  where pr.organization_id = v_org
    and p.full_name = 'Dra. Samara';

  if v_name is distinct from 'Dra. Samara' or v_active is not true or v_count <> 1 then
    raise exception 'SALA_01_TITULAR_AMBIGUOUS_OR_MISSING';
  end if;

  select p.full_name, p.is_active
    into v_name, v_active
  from public.professionals pr
  join public.profiles p on p.id = pr.profile_id
  where pr.id = v_thais
    and pr.organization_id = v_org;

  select count(*)
    into v_count
  from public.professionals pr
  join public.profiles p on p.id = pr.profile_id
  where pr.organization_id = v_org
    and p.full_name = 'Dra. Thais';

  if v_name is distinct from 'Dra. Thais' or v_active is not true or v_count <> 1 then
    raise exception 'SALA_02_TITULAR_AMBIGUOUS_OR_MISSING';
  end if;

  select count(*)
    into v_count
  from public.rooms
  where organization_id = v_org
    and code = '01'
    and room_kind = 'house_consultorio'
    and status = 'active';

  if v_count <> 1 then
    raise exception 'SALA_01_ROOM_AMBIGUOUS_OR_MISSING';
  end if;

  select count(*)
    into v_count
  from public.rooms
  where organization_id = v_org
    and code = '02'
    and room_kind = 'house_consultorio'
    and status = 'active';

  if v_count <> 1 then
    raise exception 'SALA_02_ROOM_AMBIGUOUS_OR_MISSING';
  end if;

  update public.rooms
  set occupant_professional_id = v_samara
  where organization_id = v_org
    and code = '01'
    and room_kind = 'house_consultorio'
    and status = 'active'
    and (
      occupant_professional_id is null
      or occupant_professional_id = v_samara
    );

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'SALA_01_OCCUPANT_NOT_APPLIED';
  end if;

  update public.rooms
  set occupant_professional_id = v_thais
  where organization_id = v_org
    and code = '02'
    and room_kind = 'house_consultorio'
    and status = 'active'
    and (
      occupant_professional_id is null
      or occupant_professional_id = v_thais
    );

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'SALA_02_OCCUPANT_NOT_APPLIED';
  end if;

  if exists (
    select 1
    from public.rooms
    where organization_id = v_org
      and code not in ('01', '02')
      and occupant_professional_id is not null
  ) then
    raise exception 'UNEXPECTED_ROOM_OCCUPANT';
  end if;
end $$;
