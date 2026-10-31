-- Dev full-access (opção A: multi-papel) para admin@gestao.com
-- Rodar no SQL Editor do banco da aplicação (Studio / VPS).
-- Idempotente: pode executar mais de uma vez.
-- NÃO altera senha. NÃO cria usuário Auth.
--
-- Hosped.1 (2026-10-30): NÃO APLICAR sem autorização explícita.
-- Este script concede também `physician` (acesso clínico). A regra
-- GESTÃO ≠ ACESSO CLÍNICO do ciclo Hosped.1 bloqueia aplicação automática.
-- Para só gestão: inserir apenas role `admin` (sem physician/professionals).

do $$
declare
  v_user uuid;
  v_org uuid;
  v_practice uuid;
  v_prof uuid;
begin
  select u.id, p.organization_id
    into v_user, v_org
  from auth.users u
  join public.profiles p on p.id = u.id
  where lower(u.email) = lower('admin@gestao.com');

  if v_user is null then
    raise exception 'Usuário admin@gestao.com não encontrado em auth.users/profiles.';
  end if;

  update public.profiles
     set is_active = true
   where id = v_user
     and is_active is distinct from true;

  -- Prática house preferencial; senão a primeira da org
  select pu.id into v_practice
  from public.practice_units pu
  where pu.organization_id = v_org
    and pu.kind = 'house'
    and pu.is_active
  order by pu.code
  limit 1;

  if v_practice is null then
    select pu.id into v_practice
    from public.practice_units pu
    where pu.organization_id = v_org
      and pu.is_active
    order by pu.created_at nulls last, pu.code
    limit 1;
  end if;

  if v_practice is null then
    raise exception 'Nenhuma practice_unit ativa para a organização do usuário.';
  end if;

  -- admin (gestão / locação)
  insert into public.user_practice_roles (
    user_id, practice_id, role, clinical_access,
    can_cashier, can_schedule_any_practice, can_manage_stock, can_view_care_policies
  ) values (
    v_user, v_practice, 'admin', 'none',
    true, true, true, false
  )
  on conflict (user_id, practice_id, role) do update
    set can_cashier = true,
        can_schedule_any_practice = true,
        can_manage_stock = true;

  -- secretary (recepção)
  insert into public.user_practice_roles (
    user_id, practice_id, role, clinical_access,
    can_cashier, can_schedule_any_practice, can_manage_stock, can_view_care_policies
  ) values (
    v_user, v_practice, 'secretary', 'none',
    true, true, false, true
  )
  on conflict (user_id, practice_id, role) do update
    set can_cashier = true,
        can_schedule_any_practice = true,
        can_view_care_policies = true;

  -- physician (prontuário / encounters)
  insert into public.user_practice_roles (
    user_id, practice_id, role, clinical_access,
    can_cashier, can_schedule_any_practice, can_manage_stock, can_view_care_policies
  ) values (
    v_user, v_practice, 'physician', 'practice',
    false, true, false, false
  )
  on conflict (user_id, practice_id, role) do update
    set clinical_access = 'practice',
        can_schedule_any_practice = true;

  -- professional obrigatório para abrir/assinar encounter
  select pr.id into v_prof
  from public.professionals pr
  where pr.profile_id = v_user
    and pr.practice_id = v_practice
  limit 1;

  if v_prof is null then
    insert into public.professionals (
      profile_id, practice_id, organization_id, council_type, council_number
    ) values (
      v_user, v_practice, v_org, 'CRM', 'DEV-ADMIN-GESTAO'
    )
    returning id into v_prof;
  end if;

  raise notice 'OK user=% practice=% professional=%', v_user, v_practice, v_prof;
end $$;

-- Conferência
select
  u.email,
  r.role,
  r.clinical_access,
  r.can_schedule_any_practice,
  r.can_manage_stock,
  r.can_view_care_policies,
  pu.code as practice_code,
  pr.id as professional_id,
  pr.council_type,
  pr.council_number
from auth.users u
join public.user_practice_roles r on r.user_id = u.id
join public.practice_units pu on pu.id = r.practice_id
left join public.professionals pr
  on pr.profile_id = u.id and pr.practice_id = r.practice_id
where lower(u.email) = lower('admin@gestao.com')
order by r.role;
