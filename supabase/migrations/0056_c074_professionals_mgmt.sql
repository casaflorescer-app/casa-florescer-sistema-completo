-- C074 — profissionais: perfil Auth opcional + categoria + ativo + upsert RPC.
-- ADITIVA. Não cria Auth users. Não concede SYSTEM_ADMIN.
-- NÃO aplicar sem autorização (db push / EasyPanel).

begin;

-- ---------------------------------------------------------------------------
-- 1) Categoria profissional (≠ council_type)
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'professional_category'
  ) then
    create type public.professional_category as enum (
      'medico',
      'enfermeiro',
      'fisioterapeuta',
      'psicologo',
      'nutricionista',
      'outro'
    );
  end if;
end $$;

alter table public.professionals
  add column if not exists display_name text,
  add column if not exists category public.professional_category,
  add column if not exists is_active boolean,
  add column if not exists notes text;

-- Backfill a partir de profiles (linhas atuais têm profile_id)
update public.professionals pr
set
  display_name = coalesce(nullif(btrim(pr.display_name), ''), nullif(btrim(p.full_name), ''), 'Profissional'),
  is_active = coalesce(pr.is_active, p.is_active, true),
  category = coalesce(
    pr.category,
    case
      when upper(coalesce(pr.council_type, '')) like '%CRM%' then 'medico'::public.professional_category
      when upper(coalesce(pr.council_type, '')) like '%COREN%' then 'enfermeiro'::public.professional_category
      when upper(coalesce(pr.council_type, '')) like '%CREFITO%' then 'fisioterapeuta'::public.professional_category
      when upper(coalesce(pr.council_type, '')) like '%CRP%' then 'psicologo'::public.professional_category
      when upper(coalesce(pr.council_type, '')) like '%CRN%' then 'nutricionista'::public.professional_category
      else 'outro'::public.professional_category
    end
  )
from public.profiles p
where p.id = pr.profile_id;

update public.professionals
set
  display_name = coalesce(nullif(btrim(display_name), ''), 'Profissional'),
  is_active = coalesce(is_active, true),
  category = coalesce(category, 'outro'::public.professional_category)
where display_name is null or is_active is null or category is null;

alter table public.professionals
  alter column display_name set not null,
  alter column category set not null,
  alter column is_active set not null,
  alter column is_active set default true;

alter table public.professionals
  alter column profile_id drop not null;

create unique index if not exists professionals_practice_profile_uidx
  on public.professionals (practice_id, profile_id)
  where profile_id is not null;

comment on column public.professionals.profile_id is
  'C074: opcional. NULL = sem login. Não concede RBAC.';
comment on column public.professionals.display_name is
  'Nome operacional (lista/agenda). Independente de profiles quando sem login.';
comment on column public.professionals.category is
  'Categoria profissional (≠ council_type).';
comment on column public.professionals.is_active is
  'Disponível para novos agendamentos. Histórico preservado ao inativar.';

-- ---------------------------------------------------------------------------
-- 2) Views: LEFT JOIN profiles + display_name (sem filtrar is_active aqui)
-- ---------------------------------------------------------------------------

create or replace view public.professional_labels
with (security_invoker = false)
as
select
  pr.id,
  pr.practice_id,
  pr.organization_id,
  pr.council_type,
  pr.council_number,
  pr.category,
  pr.is_active,
  coalesce(nullif(btrim(p.full_name), ''), pr.display_name) as full_name
from public.professionals pr
left join public.profiles p on p.id = pr.profile_id
where
  public.is_house_member(pr.organization_id)
  or public.has_practice_role(
    pr.practice_id,
    array['owner', 'admin', 'secretary', 'physician']::public.app_role[]
  )
  or pr.profile_id = auth.uid();

comment on view public.professional_labels is
  'C074: nome/conselho/categoria. Inclui profissionais sem login. Filtro de ativo no app.';

grant select on public.professional_labels to authenticated;

create or replace view public.room_occupancy_labels
with (security_invoker = false)
as
select
  r.id as room_id,
  r.organization_id,
  assignment.professional_id,
  coalesce(nullif(btrim(p.full_name), ''), pr.display_name) as professional_name,
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
left join public.profiles p on p.id = pr.profile_id
where public.is_house_member(r.organization_id)
   or public.is_rental_tenant(assignment.professional_id);

grant select on public.room_occupancy_labels to authenticated;

-- ---------------------------------------------------------------------------
-- 3) RPC professional_upsert (owner|admin house)
-- ---------------------------------------------------------------------------

create or replace function public.professional_upsert(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := (p_payload->>'organization_id')::uuid;
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_practice uuid := (p_payload->>'practice_id')::uuid;
  v_name text := btrim(coalesce(p_payload->>'display_name', ''));
  v_category text := coalesce(nullif(p_payload->>'category', ''), 'outro');
  v_council_type text := upper(btrim(coalesce(p_payload->>'council_type', 'OUTRO')));
  v_council_number text := nullif(btrim(coalesce(p_payload->>'council_number', '')), '');
  v_council_uf text := nullif(upper(btrim(coalesce(p_payload->>'council_uf', ''))), '');
  v_phone text := nullif(btrim(coalesce(p_payload->>'professional_phone', '')), '');
  v_email text := nullif(btrim(coalesce(p_payload->>'professional_email', '')), '');
  v_notes text := nullif(btrim(coalesce(p_payload->>'notes', '')), '');
  v_active boolean := coalesce((p_payload->>'is_active')::boolean, true);
  v_profile uuid := nullif(p_payload->>'profile_id', '')::uuid;
  v_specs jsonb := coalesce(p_payload->'specialty_ids', '[]'::jsonb);
  v_primary uuid := nullif(p_payload->>'primary_specialty_id', '')::uuid;
  v_spec uuid;
  v_i int;
begin
  if v_org is null or not public.is_house_staff(v_org, array['owner', 'admin']::public.app_role[]) then
    raise exception 'PROFESSIONAL_UPSERT_FORBIDDEN' using errcode = '42501';
  end if;
  if char_length(v_name) < 2 then
    raise exception 'PROFESSIONAL_UPSERT_NAME' using errcode = '22023';
  end if;
  if v_practice is null or not exists (
    select 1 from public.practice_units pu
    where pu.id = v_practice and pu.organization_id = v_org and pu.is_active
  ) then
    raise exception 'PROFESSIONAL_UPSERT_PRACTICE' using errcode = '22023';
  end if;
  if v_category not in ('medico', 'enfermeiro', 'fisioterapeuta', 'psicologo', 'nutricionista', 'outro') then
    raise exception 'PROFESSIONAL_UPSERT_CATEGORY' using errcode = '22023';
  end if;
  if char_length(v_council_type) < 2 then
    v_council_type := 'OUTRO';
  end if;
  if v_council_number is null then
    v_council_number := 'SN-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  end if;
  if v_council_uf is not null and char_length(v_council_uf) <> 2 then
    raise exception 'PROFESSIONAL_UPSERT_UF' using errcode = '22023';
  end if;
  if v_profile is not null and not exists (
    select 1 from public.profiles pf
    where pf.id = v_profile and pf.organization_id = v_org
  ) then
    raise exception 'PROFESSIONAL_UPSERT_PROFILE' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.professionals (
      organization_id, practice_id, profile_id, display_name, category,
      council_type, council_number, council_uf,
      professional_phone, professional_email, notes, is_active
    ) values (
      v_org, v_practice, v_profile, v_name, v_category::public.professional_category,
      v_council_type, v_council_number, v_council_uf,
      v_phone, v_email, v_notes, v_active
    )
    returning id into v_id;
    perform public.write_audit(
      'insert'::public.audit_action,
      'professionals',
      v_id,
      v_practice,
      null,
      jsonb_build_object('display_name', v_name, 'category', v_category, 'source', 'c074')
    );
  else
    update public.professionals
       set practice_id = v_practice,
           profile_id = v_profile,
           display_name = v_name,
           category = v_category::public.professional_category,
           council_type = v_council_type,
           council_number = case
             when nullif(btrim(coalesce(p_payload->>'council_number', '')), '') is null
               then council_number
             else v_council_number
           end,
           council_uf = v_council_uf,
           professional_phone = v_phone,
           professional_email = v_email,
           notes = v_notes,
           is_active = v_active
     where id = v_id and organization_id = v_org;
    if not found then
      raise exception 'PROFESSIONAL_UPSERT_NOT_FOUND' using errcode = 'P0002';
    end if;
    perform public.write_audit(
      'update'::public.audit_action,
      'professionals',
      v_id,
      v_practice,
      null,
      jsonb_build_object('display_name', v_name, 'is_active', v_active, 'source', 'c074')
    );
  end if;

  -- Sincroniza especialidades (lista completa do payload)
  delete from public.professional_specialties
  where professional_id = v_id
    and organization_id = v_org
    and not (
      specialty_id in (
        select (jsonb_array_elements_text(v_specs))::uuid
      )
    );

  for v_i in 0 .. greatest(jsonb_array_length(v_specs) - 1, -1) loop
    v_spec := (v_specs->>v_i)::uuid;
    if v_spec is null then
      continue;
    end if;
    if not exists (
      select 1 from public.clinic_specialties s
      where s.id = v_spec and s.organization_id = v_org
    ) then
      raise exception 'PROFESSIONAL_UPSERT_SPECIALTY' using errcode = '22023';
    end if;
    insert into public.professional_specialties (
      organization_id, professional_id, specialty_id, is_primary
    ) values (
      v_org, v_id, v_spec, (v_primary is not null and v_spec = v_primary)
    )
    on conflict (professional_id, specialty_id) do update
      set is_primary = excluded.is_primary;
  end loop;

  if v_primary is not null then
    update public.professional_specialties
       set is_primary = (specialty_id = v_primary)
     where professional_id = v_id and organization_id = v_org;
  elsif jsonb_array_length(v_specs) > 0 then
    update public.professional_specialties ps
       set is_primary = (ps.specialty_id = (v_specs->>0)::uuid)
     where ps.professional_id = v_id and ps.organization_id = v_org;
  end if;

  return v_id;
end;
$$;

comment on function public.professional_upsert(jsonb) is
  'C074: upsert profissional (owner/admin). profile_id opcional; sync specialty_ids.';

revoke all on function public.professional_upsert(jsonb) from public;
revoke all on function public.professional_upsert(jsonb) from anon;
grant execute on function public.professional_upsert(jsonb) to authenticated;

commit;
