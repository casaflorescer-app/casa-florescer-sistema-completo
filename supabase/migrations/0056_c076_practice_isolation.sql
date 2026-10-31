-- C076 — isolamento de duas práticas na mesma casa.
-- Não edita 0001–0055. Não cria organização, prática, usuário nem senha.
-- Não aplicar sem autorização.
-- SYSTEM_ADMIN continua fora do prontuário. is_house_ops em exame e receita permanece.

create or replace function public.can_read_cost_allocation(
  p_org uuid,
  p_practice uuid,
  p_cost_center uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_house_staff(p_org, array['owner', 'admin']::public.app_role[])
    or (
      p_practice is null
      and exists (
        select 1
        from public.cost_centers c
        where c.id = p_cost_center
          and c.organization_id = p_org
          and c.is_shared
      )
      and exists (
        select 1
        from public.user_practice_roles r
        join public.practice_units pu on pu.id = r.practice_id
        join public.profiles p on p.id = r.user_id
        where r.user_id = auth.uid()
          and p.is_active
          and r.role = 'physician'
          and pu.kind = 'house'
          and pu.organization_id = p_org
      )
    )
    or (
      p_practice is not null
      and public.has_practice_role(p_practice, array['physician']::public.app_role[])
    )
$$;

comment on function public.can_read_cost_allocation(uuid, uuid, uuid) is
  'Despesa compartilhada (sem prática e centro is_shared) para as médicas da casa e a administração. Despesa com prática só para a médica dessa prática e a administração. Secretária não entra.';

revoke all on function public.can_read_cost_allocation(uuid, uuid, uuid) from public;
grant execute on function public.can_read_cost_allocation(uuid, uuid, uuid) to authenticated;

-- Fatura: secretária deixa de ler. Caixa só na prática do papel. Admin da casa vê o consolidado.
drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices
  for select using (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
    or exists (
      select 1
      from public.user_practice_roles r
      where r.user_id = auth.uid()
        and r.practice_id = invoices.practice_id
        and r.can_cashier
    )
  );

-- Cadastro da casa: secretária e administração. Médica não entra por este caminho.
drop policy if exists patients_house_select on public.patients;
create policy patients_house_select on public.patients
  for select using (
    public.is_house_staff(organization_id, array['owner', 'admin', 'secretary']::public.app_role[])
  );

-- Ficha clínica segue quem pode ler o prontuário da prática vinculada, não qualquer médica da casa.
drop policy if exists patient_clinical_data_physician_select on public.patient_clinical_data;
create policy patient_clinical_data_clinical_select on public.patient_clinical_data
  for select using (
    public.is_patient_self(patient_id)
    or exists (
      select 1
      from public.patient_practice_links l
      join public.professionals pr
        on pr.profile_id = auth.uid()
       and pr.practice_id = l.practice_id
      where l.patient_id = patient_clinical_data.patient_id
        and public.can_read_clinical(
          l.practice_id,
          patient_clinical_data.patient_id,
          pr.id
        )
    )
  );

drop policy if exists patient_clinical_data_physician_insert on public.patient_clinical_data;
create policy patient_clinical_data_clinical_insert on public.patient_clinical_data
  for insert with check (
    exists (
      select 1
      from public.patient_practice_links l
      where l.patient_id = patient_clinical_data.patient_id
        and public.can_write_clinical(l.practice_id)
    )
  );

drop policy if exists patient_clinical_data_physician_update on public.patient_clinical_data;
create policy patient_clinical_data_clinical_update on public.patient_clinical_data
  for update using (
    exists (
      select 1
      from public.patient_practice_links l
      where l.patient_id = patient_clinical_data.patient_id
        and public.can_write_clinical(l.practice_id)
    )
  )
  with check (
    exists (
      select 1
      from public.patient_practice_links l
      where l.patient_id = patient_clinical_data.patient_id
        and public.can_write_clinical(l.practice_id)
    )
  );

-- Evolução obstétrica: leitura só por can_read_clinical. Escrita continua na prática.
drop policy if exists obstetric_followups_clinical on public.obstetric_followups;
create policy obstetric_followups_select on public.obstetric_followups
  for select using (
    public.can_read_clinical(practice_id, patient_id, professional_id)
  );

create policy obstetric_followups_write on public.obstetric_followups
  for insert with check (public.can_write_clinical(practice_id));

create policy obstetric_followups_update on public.obstetric_followups
  for update using (public.can_write_clinical(practice_id))
  with check (public.can_write_clinical(practice_id));

create policy obstetric_followups_delete on public.obstetric_followups
  for delete using (public.can_write_clinical(practice_id));

drop policy if exists cost_allocations_house on public.cost_allocations;
create policy cost_allocations_select on public.cost_allocations
  for select using (
    public.can_read_cost_allocation(organization_id, practice_id, cost_center_id)
  );

create policy cost_allocations_write on public.cost_allocations
  for insert with check (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  );

create policy cost_allocations_update on public.cost_allocations
  for update using (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  )
  with check (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  );

create policy cost_allocations_delete on public.cost_allocations
  for delete using (
    public.is_house_staff(organization_id, array['owner', 'admin']::public.app_role[])
  );

create policy cost_centers_physician_select on public.cost_centers
  for select using (
    (
      is_shared
      and exists (
        select 1
        from public.user_practice_roles r
        join public.practice_units pu on pu.id = r.practice_id
        join public.profiles p on p.id = r.user_id
        where r.user_id = auth.uid()
          and p.is_active
          and r.role = 'physician'
          and pu.kind = 'house'
          and pu.organization_id = cost_centers.organization_id
      )
    )
    or exists (
      select 1
      from public.cost_allocations a
      where a.cost_center_id = cost_centers.id
        and a.practice_id is not null
        and public.has_practice_role(a.practice_id, array['physician']::public.app_role[])
    )
  );

-- Hash de senha só para o papel da aplicação, antes do SET ROLE authenticated.
create or replace function public.staff_login_hash(p_email text)
returns table (user_id uuid, password_hash text)
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id, c.password_hash
  from auth.users u
  join public.staff_credentials c on c.user_id = u.id
  join public.profiles p on p.id = u.id
  where p.is_active
    and lower(p.email::text) = lower(btrim(p_email))
$$;

comment on function public.staff_login_hash(text) is
  'Devolve o hash Argon2id ao processo casa_app. Não conceder a authenticated.';

revoke all on function public.staff_login_hash(text) from public;
revoke all on function public.staff_login_hash(text) from anon, authenticated;
grant execute on function public.staff_login_hash(text) to casa_app;
