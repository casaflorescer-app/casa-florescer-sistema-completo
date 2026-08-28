-- Fase A (correção) — autorização expressa da retaguarda + SELECT/UPDATE alinhados.
-- NÃO edita 0011. Sem campos comerciais.
-- Retaguarda cadastrada NÃO lê/escreve a gestação até grant vigente.
-- SYSTEM_ADMIN continua sem god mode clínico.

alter type public.pregnancy_event_kind add value if not exists 'backup_access_granted';
alter type public.pregnancy_event_kind add value if not exists 'backup_access_revoked';

-- ---------------------------------------------------------------------------
-- Histórico auditável de autorização (não é booleano isolado)
-- ---------------------------------------------------------------------------

create table public.pregnancy_backup_grants (
  id uuid primary key default gen_random_uuid(),
  pregnancy_id uuid not null references public.pregnancies (id),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  patient_id uuid not null references public.patients (id),
  principal_professional_id uuid not null references public.professionals (id),
  backup_professional_id uuid not null references public.professionals (id),
  granted_by uuid not null references public.profiles (id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id),
  check (revoked_at is null or revoked_at >= granted_at),
  check (backup_professional_id is distinct from principal_professional_id)
);

create unique index pregnancy_backup_grants_one_active
  on public.pregnancy_backup_grants (pregnancy_id)
  where revoked_at is null;

create index pregnancy_backup_grants_pregnancy_idx
  on public.pregnancy_backup_grants (pregnancy_id, granted_at desc);

comment on table public.pregnancy_backup_grants is
  'Autorização expressa da médica principal para a retaguarda ver/gestionar ESTA gestação. Revogação preenche revoked_at; não apaga a linha. Não amplia acesso à prática, org ou demais gestações.';

-- ---------------------------------------------------------------------------
-- Funções de acesso (substitui SELECT amplo da retaguarda e UPDATE só por prática)
-- ---------------------------------------------------------------------------

create or replace function public.is_pregnancy_principal(p_primary uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.professionals pr
    where pr.id = p_primary
      and pr.profile_id = auth.uid()
  )
$$;

create or replace function public.has_active_pregnancy_backup_grant(p_pregnancy uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pregnancy_backup_grants g
    join public.professionals pr on pr.id = g.backup_professional_id
    where g.pregnancy_id = p_pregnancy
      and g.revoked_at is null
      and pr.profile_id = auth.uid()
  )
$$;

create or replace function public.can_create_pregnancy(p_practice uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_practice_role(
    p_practice,
    array['owner', 'admin', 'secretary', 'physician']::public.app_role[]
  )
$$;

create or replace function public.can_access_pregnancy(
  p_pregnancy uuid,
  p_practice uuid,
  p_patient uuid,
  p_primary uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_active_break_glass(p_practice, p_patient)
  or public.has_practice_role(
    p_practice,
    array['owner', 'admin', 'secretary']::public.app_role[]
  )
  or public.is_pregnancy_principal(p_primary)
  or public.has_active_pregnancy_backup_grant(p_pregnancy)
$$;

comment on function public.can_access_pregnancy(uuid, uuid, uuid, uuid) is
  'SELECT e UPDATE da gestação: ops da prática (owner/admin/secretary), médica principal, retaguarda COM grant vigente, ou break-glass. Não basta estar cadastrada como retaguarda. Não é acesso por organização nem por clinical_access=practice.';

-- Compatibilidade: SELECT deixa de incluir retaguarda sem grant.
create or replace function public.can_select_pregnancy(
  p_practice uuid,
  p_patient uuid,
  p_primary uuid,
  p_backup uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_active_break_glass(p_practice, p_patient)
  or public.has_practice_role(
    p_practice,
    array['owner', 'admin', 'secretary']::public.app_role[]
  )
  or public.is_pregnancy_principal(p_primary)
$$;

comment on function public.can_select_pregnancy(uuid, uuid, uuid, uuid) is
  'Legado 0011. Policies 0012 usam can_access_pregnancy. Retaguarda sem grant NÃO entra aqui.';

-- UPDATE legado era só membership physician da prática (mais amplo que o SELECT).
-- Redefinido para ops da prática: não usar sozinho em policies de linha.
create or replace function public.can_write_pregnancy(p_practice uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_practice_role(
    p_practice,
    array['owner', 'admin', 'secretary']::public.app_role[]
  )
$$;

revoke all on function public.is_pregnancy_principal(uuid) from public;
revoke all on function public.has_active_pregnancy_backup_grant(uuid) from public;
revoke all on function public.can_create_pregnancy(uuid) from public;
revoke all on function public.can_access_pregnancy(uuid, uuid, uuid, uuid) from public;
grant execute on function public.is_pregnancy_principal(uuid) to authenticated;
grant execute on function public.has_active_pregnancy_backup_grant(uuid) to authenticated;
grant execute on function public.can_create_pregnancy(uuid) to authenticated;
grant execute on function public.can_access_pregnancy(uuid, uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Grant / revoke (somente médica principal). Histórico não é apagado.
-- ---------------------------------------------------------------------------

create or replace function public.grant_pregnancy_backup_access(p_pregnancy uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.pregnancies%rowtype;
  v_backup_practice uuid;
  v_id uuid;
begin
  select * into v_row from public.pregnancies where id = p_pregnancy;
  if v_row.id is null then
    raise exception 'Gestação inexistente.';
  end if;
  if not public.is_pregnancy_principal(v_row.primary_professional_id) then
    raise exception 'Somente a médica principal pode autorizar o compartilhamento com a retaguarda.';
  end if;
  if v_row.backup_professional_id is null then
    raise exception 'Defina a médica de retaguarda antes de autorizar o acesso.';
  end if;
  if v_row.status is distinct from 'in_care' then
    raise exception 'Não é possível autorizar retaguarda em gestação encerrada.';
  end if;
  if exists (
    select 1 from public.pregnancy_backup_grants g
    where g.pregnancy_id = p_pregnancy and g.revoked_at is null
  ) then
    raise exception 'Já existe autorização vigente para a retaguarda nesta gestação.';
  end if;

  insert into public.pregnancy_backup_grants (
    pregnancy_id, organization_id, practice_id, patient_id,
    principal_professional_id, backup_professional_id, granted_by
  ) values (
    v_row.id, v_row.organization_id, v_row.practice_id, v_row.patient_id,
    v_row.primary_professional_id, v_row.backup_professional_id, auth.uid()
  )
  returning id into v_id;

  select practice_id into v_backup_practice
  from public.professionals
  where id = v_row.backup_professional_id;

  if v_backup_practice is not null then
    insert into public.patient_practice_links (patient_id, practice_id)
    values (v_row.patient_id, v_backup_practice)
    on conflict (patient_id, practice_id) do nothing;
  end if;

  insert into public.pregnancy_events (
    pregnancy_id, organization_id, practice_id, patient_id,
    kind, actor_id, to_value
  ) values (
    v_row.id, v_row.organization_id, v_row.practice_id, v_row.patient_id,
    'backup_access_granted', auth.uid(),
    jsonb_build_object(
      'grant_id', v_id,
      'backup_professional_id', v_row.backup_professional_id,
      'principal_professional_id', v_row.primary_professional_id
    )
  );

  perform public.write_audit(
    'grant',
    'pregnancy_backup_grants',
    v_id,
    v_row.practice_id,
    v_row.patient_id,
    jsonb_build_object('pregnancy_id', v_row.id, 'backup_professional_id', v_row.backup_professional_id)
  );

  return v_id;
end;
$$;

create or replace function public.revoke_pregnancy_backup_access(p_pregnancy uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.pregnancies%rowtype;
  v_grant public.pregnancy_backup_grants%rowtype;
begin
  select * into v_row from public.pregnancies where id = p_pregnancy;
  if v_row.id is null then
    raise exception 'Gestação inexistente.';
  end if;
  if not public.is_pregnancy_principal(v_row.primary_professional_id)
     and not public.has_practice_role(
       v_row.practice_id,
       array['owner', 'admin']::public.app_role[]
     ) then
    raise exception 'Somente a médica principal (ou owner/admin da prática) pode revogar a autorização.';
  end if;

  select * into v_grant
  from public.pregnancy_backup_grants g
  where g.pregnancy_id = p_pregnancy
    and g.revoked_at is null
  for update;

  if v_grant.id is null then
    raise exception 'Não há autorização vigente para revogar.';
  end if;

  update public.pregnancy_backup_grants
  set revoked_at = now(),
      revoked_by = auth.uid()
  where id = v_grant.id;

  insert into public.pregnancy_events (
    pregnancy_id, organization_id, practice_id, patient_id,
    kind, actor_id, from_value, to_value
  ) values (
    v_row.id, v_row.organization_id, v_row.practice_id, v_row.patient_id,
    'backup_access_revoked', auth.uid(),
    jsonb_build_object('grant_id', v_grant.id, 'backup_professional_id', v_grant.backup_professional_id),
    jsonb_build_object('revoked', true)
  );

  perform public.write_audit(
    'revoke',
    'pregnancy_backup_grants',
    v_grant.id,
    v_row.practice_id,
    v_row.patient_id,
    jsonb_build_object('pregnancy_id', v_row.id, 'backup_professional_id', v_grant.backup_professional_id)
  );
end;
$$;

revoke all on function public.grant_pregnancy_backup_access(uuid) from public;
revoke all on function public.revoke_pregnancy_backup_access(uuid) from public;
grant execute on function public.grant_pregnancy_backup_access(uuid) to authenticated;
grant execute on function public.revoke_pregnancy_backup_access(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Integridade: retaguarda autorizada não troca titular; troca de principal/retaguarda revoga grant
-- ---------------------------------------------------------------------------

create or replace function public.pregnancies_before_write()
returns trigger
language plpgsql
as $$
declare
  v_patient_org uuid;
  v_primary public.professionals%rowtype;
  v_backup public.professionals%rowtype;
begin
  new.organization_id := public.resolve_org_from_practice(new.practice_id, new.organization_id);
  new.updated_at := now();
  new.last_change_reason := nullif(btrim(coalesce(new.last_change_reason, '')), '');

  select organization_id into v_patient_org
  from public.patients
  where id = new.patient_id;

  if v_patient_org is null then
    raise exception 'Paciente inexistente.';
  end if;
  if v_patient_org is distinct from new.organization_id then
    raise exception 'Gestação deve pertencer à mesma organização da paciente.';
  end if;

  select * into v_primary
  from public.professionals
  where id = new.primary_professional_id;

  if v_primary.id is null then
    raise exception 'Médica principal inexistente.';
  end if;
  if v_primary.organization_id is distinct from new.organization_id then
    raise exception 'Médica principal de outra organização.';
  end if;
  if v_primary.practice_id is distinct from new.practice_id then
    raise exception 'Médica principal deve pertencer à prática da gestação.';
  end if;

  if new.backup_professional_id is not null then
    select * into v_backup
    from public.professionals
    where id = new.backup_professional_id;

    if v_backup.id is null then
      raise exception 'Médica de retaguarda inexistente.';
    end if;
    if v_backup.organization_id is distinct from new.organization_id then
      raise exception 'Médica de retaguarda de outra organização.';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if new.created_by is null then
      new.created_by := auth.uid();
    end if;
    if new.created_by is distinct from auth.uid() then
      raise exception 'created_by deve ser o usuário autenticado.';
    end if;
    if new.status is distinct from 'in_care' then
      raise exception 'Gestação nasce em acompanhamento.';
    end if;
    new.status_reason := null;
    new.status_changed_at := null;
    new.status_changed_by := null;
  end if;

  if tg_op = 'UPDATE' then
    if new.patient_id is distinct from old.patient_id
       or new.organization_id is distinct from old.organization_id then
      raise exception 'Não é permitido alterar paciente ou organização da gestação.';
    end if;
    if old.status is distinct from 'in_care' then
      raise exception 'Gestação encerrada, transferida ou cancelada não pode ser alterada.';
    end if;
    if new.primary_professional_id is distinct from old.primary_professional_id
       or new.backup_professional_id is distinct from old.backup_professional_id
       or new.practice_id is distinct from old.practice_id then
      if not public.is_pregnancy_principal(old.primary_professional_id)
         and not public.can_create_pregnancy(old.practice_id) then
        raise exception 'Somente a médica principal ou a equipe da prática podem alterar responsáveis ou prática.';
      end if;
    end if;
    if new.status is distinct from old.status then
      if new.status is not distinct from 'in_care' then
        raise exception 'Não é permitido reabrir a gestação nesta fase.';
      end if;
      if new.status_reason is null or char_length(btrim(new.status_reason)) < 3 then
        raise exception 'Informe o motivo do encerramento, transferência ou cancelamento.';
      end if;
      new.status_reason := btrim(new.status_reason);
      new.status_changed_at := now();
      new.status_changed_by := auth.uid();
    else
      new.status_reason := old.status_reason;
      new.status_changed_at := old.status_changed_at;
      new.status_changed_by := old.status_changed_by;
    end if;
    if new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Metadados de criação são imutáveis.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.pregnancies_after_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text;
begin
  if tg_op = 'INSERT' then
    insert into public.patient_practice_links (patient_id, practice_id)
    values (new.patient_id, new.practice_id)
    on conflict (patient_id, practice_id) do nothing;

    insert into public.pregnancy_events (
      pregnancy_id, organization_id, practice_id, patient_id,
      kind, actor_id, reason, to_value
    ) values (
      new.id, new.organization_id, new.practice_id, new.patient_id,
      'created', auth.uid(), new.last_change_reason,
      jsonb_build_object(
        'practice_id', new.practice_id,
        'primary_professional_id', new.primary_professional_id,
        'backup_professional_id', new.backup_professional_id,
        'status', new.status
      )
    );

    perform public.write_audit(
      'insert',
      'pregnancies',
      new.id,
      new.practice_id,
      new.patient_id,
      jsonb_build_object('status', new.status)
    );
    return new;
  end if;

  v_reason := new.last_change_reason;

  if new.primary_professional_id is distinct from old.primary_professional_id
     or new.backup_professional_id is distinct from old.backup_professional_id then
    update public.pregnancy_backup_grants
    set revoked_at = coalesce(revoked_at, now()),
        revoked_by = coalesce(revoked_by, auth.uid())
    where pregnancy_id = new.id
      and revoked_at is null;
  end if;

  if new.practice_id is distinct from old.practice_id then
    insert into public.pregnancy_events (
      pregnancy_id, organization_id, practice_id, patient_id,
      kind, actor_id, reason, from_value, to_value
    ) values (
      new.id, new.organization_id, new.practice_id, new.patient_id,
      'practice_changed', auth.uid(), v_reason,
      jsonb_build_object('practice_id', old.practice_id),
      jsonb_build_object('practice_id', new.practice_id)
    );
    insert into public.patient_practice_links (patient_id, practice_id)
    values (new.patient_id, new.practice_id)
    on conflict (patient_id, practice_id) do nothing;
  end if;

  if new.primary_professional_id is distinct from old.primary_professional_id then
    insert into public.pregnancy_events (
      pregnancy_id, organization_id, practice_id, patient_id,
      kind, actor_id, reason, from_value, to_value
    ) values (
      new.id, new.organization_id, new.practice_id, new.patient_id,
      'principal_changed', auth.uid(), v_reason,
      jsonb_build_object('primary_professional_id', old.primary_professional_id),
      jsonb_build_object('primary_professional_id', new.primary_professional_id)
    );
  end if;

  if new.backup_professional_id is distinct from old.backup_professional_id then
    insert into public.pregnancy_events (
      pregnancy_id, organization_id, practice_id, patient_id,
      kind, actor_id, reason, from_value, to_value
    ) values (
      new.id, new.organization_id, new.practice_id, new.patient_id,
      'backup_changed', auth.uid(), v_reason,
      jsonb_build_object('backup_professional_id', old.backup_professional_id),
      jsonb_build_object('backup_professional_id', new.backup_professional_id)
    );
  end if;

  if new.status is distinct from old.status then
    insert into public.pregnancy_events (
      pregnancy_id, organization_id, practice_id, patient_id,
      kind, actor_id, reason, from_value, to_value
    ) values (
      new.id, new.organization_id, new.practice_id, new.patient_id,
      case new.status
        when 'closed' then 'closed'::public.pregnancy_event_kind
        when 'transferred' then 'transferred'::public.pregnancy_event_kind
        when 'cancelled' then 'cancelled'::public.pregnancy_event_kind
        else 'updated'::public.pregnancy_event_kind
      end,
      auth.uid(),
      new.status_reason,
      jsonb_build_object('status', old.status),
      jsonb_build_object('status', new.status)
    );
  elsif
    new.lmp_date is distinct from old.lmp_date
    or new.clinical_edd is distinct from old.clinical_edd
    or new.pregnancy_number is distinct from old.pregnancy_number
    or new.risk is distinct from old.risk
    or new.care_started_on is distinct from old.care_started_on
    or new.notes is distinct from old.notes
  then
    insert into public.pregnancy_events (
      pregnancy_id, organization_id, practice_id, patient_id,
      kind, actor_id, reason, from_value, to_value
    ) values (
      new.id, new.organization_id, new.practice_id, new.patient_id,
      'updated', auth.uid(), v_reason,
      jsonb_build_object(
        'lmp_date', old.lmp_date,
        'clinical_edd', old.clinical_edd,
        'pregnancy_number', old.pregnancy_number,
        'risk', old.risk,
        'care_started_on', old.care_started_on
      ),
      jsonb_build_object(
        'lmp_date', new.lmp_date,
        'clinical_edd', new.clinical_edd,
        'pregnancy_number', new.pregnancy_number,
        'risk', new.risk,
        'care_started_on', new.care_started_on
      )
    );
  end if;

  perform public.write_audit(
    'update',
    'pregnancies',
    new.id,
    new.practice_id,
    new.patient_id,
    jsonb_build_object(
      'status', new.status,
      'principal_changed', new.primary_professional_id is distinct from old.primary_professional_id,
      'backup_changed', new.backup_professional_id is distinct from old.backup_professional_id,
      'practice_changed', new.practice_id is distinct from old.practice_id
    )
  );

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

drop policy if exists pregnancies_select on public.pregnancies;
drop policy if exists pregnancies_insert on public.pregnancies;
drop policy if exists pregnancies_update on public.pregnancies;
drop policy if exists pregnancy_events_select on public.pregnancy_events;

create policy pregnancies_select on public.pregnancies
  for select using (
    public.can_access_pregnancy(
      pregnancies.id,
      pregnancies.practice_id,
      pregnancies.patient_id,
      pregnancies.primary_professional_id
    )
  );

create policy pregnancies_insert on public.pregnancies
  for insert with check (
    public.can_create_pregnancy(pregnancies.practice_id)
  );

create policy pregnancies_update on public.pregnancies
  for update using (
    public.can_access_pregnancy(
      pregnancies.id,
      pregnancies.practice_id,
      pregnancies.patient_id,
      pregnancies.primary_professional_id
    )
  )
  with check (
    public.can_access_pregnancy(
      pregnancies.id,
      pregnancies.practice_id,
      pregnancies.patient_id,
      pregnancies.primary_professional_id
    )
    or public.can_create_pregnancy(pregnancies.practice_id)
  );

create policy pregnancy_events_select on public.pregnancy_events
  for select using (
    exists (
      select 1
      from public.pregnancies g
      where g.id = pregnancy_events.pregnancy_id
        and public.can_access_pregnancy(
          g.id,
          g.practice_id,
          g.patient_id,
          g.primary_professional_id
        )
    )
  );

alter table public.pregnancy_backup_grants enable row level security;

create policy pregnancy_backup_grants_select on public.pregnancy_backup_grants
  for select using (
    exists (
      select 1
      from public.pregnancies g
      where g.id = pregnancy_backup_grants.pregnancy_id
        and public.can_access_pregnancy(
          g.id,
          g.practice_id,
          g.patient_id,
          g.primary_professional_id
        )
    )
  );

-- INSERT/UPDATE de grants só via RPC definer.

grant select on public.pregnancy_backup_grants to authenticated;
revoke insert, update, delete on public.pregnancy_backup_grants from authenticated, anon;
