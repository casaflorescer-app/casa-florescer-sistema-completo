-- Fase A — Gestão da Gestação.
-- Episódio obstétrico 1:N com patients. Não reutiliza patient_clinical_data (1:1)
-- nem obstetric_followups (acompanhamento legado, EDD obrigatória, um profissional).
-- Sem preço, contrato, disponibilidade comercial ou assinatura.
-- SYSTEM_ADMIN não recebe god mode clínico (mesmo critério de 0007).

create type public.pregnancy_status as enum (
  'in_care',
  'closed',
  'transferred',
  'cancelled'
);

create type public.pregnancy_risk as enum (
  'habitual',
  'high'
);

create type public.pregnancy_event_kind as enum (
  'created',
  'updated',
  'principal_changed',
  'backup_changed',
  'practice_changed',
  'closed',
  'transferred',
  'cancelled'
);

comment on type public.pregnancy_status is
  'Status operacional da gestação. Não é desfecho obstétrico (via de parto). transferred = acompanhamento saiu desta prática/clínica; troca de médica principal não muda o status.';

-- ---------------------------------------------------------------------------
-- Pregnancies
-- ---------------------------------------------------------------------------

create table public.pregnancies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  patient_id uuid not null references public.patients (id),
  primary_professional_id uuid not null references public.professionals (id),
  backup_professional_id uuid references public.professionals (id),
  lmp_date date,
  calculated_edd date generated always as (public.naegele_edd(lmp_date)) stored,
  clinical_edd date,
  pregnancy_number smallint check (pregnancy_number is null or pregnancy_number >= 1),
  risk public.pregnancy_risk,
  care_started_on date,
  notes text,
  status public.pregnancy_status not null default 'in_care',
  status_reason text,
  status_changed_at timestamptz,
  status_changed_by uuid references public.profiles (id),
  last_change_reason text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (id, practice_id),
  unique (id, patient_id),
  check (backup_professional_id is distinct from primary_professional_id)
);

create unique index pregnancies_one_in_care_per_patient
  on public.pregnancies (patient_id)
  where status = 'in_care';

create index pregnancies_patient_idx on public.pregnancies (patient_id, created_at desc);
create index pregnancies_practice_idx on public.pregnancies (practice_id, status);
create index pregnancies_primary_idx on public.pregnancies (primary_professional_id);
create index pregnancies_org_idx on public.pregnancies (organization_id);

comment on table public.pregnancies is
  'Episódio obstétrico. Uma paciente pode ter várias gestações históricas; no máximo uma em acompanhamento. Não é o cadastro MPI nem a ficha 1:1 patient_clinical_data.';
comment on column public.pregnancies.calculated_edd is
  'DPP calculada (Naegele: DUM + 280). Gerada; não pode ser sobrescrita.';
comment on column public.pregnancies.clinical_edd is
  'DPP ajustada/informada pela profissional. Independente da calculada.';
comment on column public.pregnancies.notes is
  'Observações administrativas/contextuais da gestação. Não é prontuário clínico.';
comment on column public.pregnancies.pregnancy_number is
  'Número obstétrico informado (G). Não é a contagem automática de linhas no sistema.';
comment on column public.pregnancies.primary_professional_id is
  'Médica responsável pelo acompanhamento. Troca não cria nova gestação.';
comment on column public.pregnancies.backup_professional_id is
  'Médica de retaguarda. Não substitui automaticamente a principal.';
comment on column public.pregnancies.status is
  'in_care / closed / transferred / cancelled. Distinto de desfecho de parto (fase futura).';

-- ---------------------------------------------------------------------------
-- Eventos operacionais (histórico visível à equipe). Auditoria de segurança
-- continua em audit_events via write_audit. Não é segunda infraestrutura de audit.
-- ---------------------------------------------------------------------------

create table public.pregnancy_events (
  id uuid primary key default gen_random_uuid(),
  pregnancy_id uuid not null references public.pregnancies (id),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  patient_id uuid not null references public.patients (id),
  kind public.pregnancy_event_kind not null,
  actor_id uuid references public.profiles (id),
  occurred_at timestamptz not null default now(),
  reason text,
  from_value jsonb not null default '{}'::jsonb,
  to_value jsonb not null default '{}'::jsonb
);

create index pregnancy_events_pregnancy_idx
  on public.pregnancy_events (pregnancy_id, occurred_at desc);

comment on table public.pregnancy_events is
  'Histórico operacional da gestação (criação, responsáveis, prática, encerramento). Append-only. Complementa audit_events; não o substitui.';

-- Rótulos de profissionais visíveis a quem já pode ver a linha em professionals.
-- security_invoker = false: locatário precisa do nome da colega da mesma prática
-- (profiles_org_staff_select exige is_house_member e bloquearia o join).
create or replace view public.professional_labels
with (security_invoker = false)
as
select
  pr.id,
  pr.practice_id,
  pr.organization_id,
  pr.council_type,
  pr.council_number,
  p.full_name
from public.professionals pr
join public.profiles p on p.id = pr.profile_id
where public.is_house_member(pr.organization_id)
   or public.has_practice_role(
     pr.practice_id,
     array['owner', 'admin', 'secretary', 'physician']::public.app_role[]
   )
   or pr.profile_id = auth.uid();

comment on view public.professional_labels is
  'Nome e conselho de profissionais no perímetro já permitido por professionals_select. Não amplia acesso clínico.';

grant select on public.professional_labels to authenticated;

-- ---------------------------------------------------------------------------
-- Autorização
-- ---------------------------------------------------------------------------

create or replace function public.is_pregnancy_named_professional(
  p_primary uuid,
  p_backup uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.professionals pr
    where pr.profile_id = auth.uid()
      and (
        pr.id = p_primary
        or (p_backup is not null and pr.id = p_backup)
      )
  )
$$;

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
  or public.is_pregnancy_named_professional(p_primary, p_backup)
  or exists (
    select 1
    from public.user_practice_roles r
    join public.profiles p on p.id = r.user_id
    where r.user_id = auth.uid()
      and p.is_active
      and r.practice_id = p_practice
      and r.role = 'physician'
      and r.clinical_access = 'practice'
  )
$$;

create or replace function public.can_write_pregnancy(p_practice uuid)
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

comment on function public.can_select_pregnancy(uuid, uuid, uuid, uuid) is
  'Leitura da gestação: ops da prática, physician com clinical_access=practice, médica principal/retaguarda nomeada, ou break-glass. Não é acesso por organização.';
comment on function public.can_write_pregnancy(uuid) is
  'Escrita: owner/admin/secretary/physician com membership na prática da gestação.';

revoke all on function public.is_pregnancy_named_professional(uuid, uuid) from public;
revoke all on function public.can_select_pregnancy(uuid, uuid, uuid, uuid) from public;
revoke all on function public.can_write_pregnancy(uuid) from public;
grant execute on function public.is_pregnancy_named_professional(uuid, uuid) to authenticated;
grant execute on function public.can_select_pregnancy(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.can_write_pregnancy(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Integridade
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

create or replace function public.pregnancies_forbid_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Gestações não são excluídas. Encerre, transfira ou cancele o acompanhamento.';
end;
$$;

create or replace function public.pregnancy_events_forbid_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Histórico da gestação é apenas inclusão.';
end;
$$;

drop trigger if exists pregnancies_before_write on public.pregnancies;
create trigger pregnancies_before_write
  before insert or update on public.pregnancies
  for each row execute function public.pregnancies_before_write();

drop trigger if exists pregnancies_after_write on public.pregnancies;
create trigger pregnancies_after_write
  after insert or update on public.pregnancies
  for each row execute function public.pregnancies_after_write();

drop trigger if exists pregnancies_forbid_delete on public.pregnancies;
create trigger pregnancies_forbid_delete
  before delete on public.pregnancies
  for each row execute function public.pregnancies_forbid_delete();

drop trigger if exists pregnancy_events_forbid_mutation on public.pregnancy_events;
create trigger pregnancy_events_forbid_mutation
  before update or delete on public.pregnancy_events
  for each row execute function public.pregnancy_events_forbid_mutation();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.pregnancies enable row level security;
alter table public.pregnancy_events enable row level security;

create policy pregnancies_select on public.pregnancies
  for select using (
    public.can_select_pregnancy(
      pregnancies.practice_id,
      pregnancies.patient_id,
      pregnancies.primary_professional_id,
      pregnancies.backup_professional_id
    )
  );

create policy pregnancies_insert on public.pregnancies
  for insert with check (
    public.can_write_pregnancy(pregnancies.practice_id)
  );

create policy pregnancies_update on public.pregnancies
  for update using (
    public.can_write_pregnancy(pregnancies.practice_id)
  )
  with check (
    public.can_write_pregnancy(pregnancies.practice_id)
  );

create policy pregnancy_events_select on public.pregnancy_events
  for select using (
    exists (
      select 1
      from public.pregnancies g
      where g.id = pregnancy_events.pregnancy_id
        and public.can_select_pregnancy(
          g.practice_id,
          g.patient_id,
          g.primary_professional_id,
          g.backup_professional_id
        )
    )
  );

-- INSERT de eventos é feito pelo trigger definer; authenticated não insere direto.
-- Sem policy de insert/update/delete para authenticated.

grant usage on type public.pregnancy_status to authenticated;
grant usage on type public.pregnancy_risk to authenticated;
grant usage on type public.pregnancy_event_kind to authenticated;

grant select, insert, update on public.pregnancies to authenticated;
grant select on public.pregnancy_events to authenticated;
revoke delete on public.pregnancies from authenticated, anon;
revoke insert, update, delete on public.pregnancy_events from authenticated, anon;
