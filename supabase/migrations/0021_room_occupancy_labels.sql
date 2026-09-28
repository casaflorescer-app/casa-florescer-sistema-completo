-- COMMIT 029 / Migration 0021 — ocupação operacional das salas
--
-- A equipe da casa precisa saber quem ocupa cada consultório.
-- Esta view não abre rental_contracts: não expõe aluguel, utilidades,
-- notas, vigência financeira nem demais cláusulas.
-- Salas próprias vêm de rooms.occupant_professional_id.
-- Salas locadas vêm do contrato ativo ou agendado, apenas o profissional.
--
-- Não altera policies, RPCs clínicas, agenda nem dados.

create or replace view public.room_occupancy_labels
with (security_invoker = false)
as
select
  r.id as room_id,
  r.organization_id,
  assignment.professional_id,
  p.full_name as professional_name,
  assignment.occupancy
from public.rooms r
join lateral (
  select
    r.occupant_professional_id as professional_id,
    'propria'::text as occupancy
  where r.room_kind = 'house_consultorio'
    and r.occupant_professional_id is not null
  union all
  select
    c.tenant_professional_id,
    'locada'::text
  from public.rental_contracts c
  where c.room_id = r.id
    and r.room_kind = 'sublet_consultorio'
    and r.occupant_professional_id is null
    and c.tenant_professional_id is not null
    and c.is_active
    and c.status in ('scheduled', 'active')
) assignment on true
join public.professionals pr on pr.id = assignment.professional_id
join public.profiles p on p.id = pr.profile_id
where public.is_house_member(r.organization_id)
   or public.is_rental_tenant(assignment.professional_id);

comment on view public.room_occupancy_labels is
  'Ocupação operacional da sala: profissional titular ou locatário ativo. Não inclui valor, notas nem condições do contrato.';

revoke all on table public.room_occupancy_labels from public;
revoke all on table public.room_occupancy_labels from anon;
grant select on table public.room_occupancy_labels to authenticated;
