-- ============================================================================
-- CASA FLORESCER — FASE B2 (Commit 011 candidato)
-- Procedimentos de gestação + repasse opcional à retaguarda + ledger próprio
--
-- NÃO misturar com professional_care_policies (B1).
-- NÃO alterar pregnancies / pregnancy_backup_grants / can_access_pregnancy (Fase A).
-- NÃO aplicar no remoto sem autorização explícita.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Catálogo: parto obstétrico (extensível por código)
-- ---------------------------------------------------------------------------

insert into public.procedures (organization_id, practice_id, code, name, duration_min, is_shared)
select
  o.id,
  null,
  'OBSTETRIC_BIRTH',
  'Parto obstétrico',
  60,
  true
from public.organizations o
where not exists (
  select 1
  from public.procedures p
  where p.organization_id = o.id
    and p.code = 'OBSTETRIC_BIRTH'
);

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table if not exists public.pregnancy_procedures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  pregnancy_id uuid not null references public.pregnancies (id) on delete restrict,
  procedure_id uuid not null references public.procedures (id),
  procedure_code text not null,
  performed_by_professional_id uuid not null references public.professionals (id),
  performed_as text not null
    check (performed_as in ('principal', 'backup')),
  backup_grant_id uuid references public.pregnancy_backup_grants (id),
  performed_at date not null,
  notes text,
  created_by uuid not null references public.profiles (id),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pregnancy_procedures_notes_len check (notes is null or char_length(notes) <= 4000),
  constraint pregnancy_procedures_backup_grant_consistency check (
    (performed_as = 'principal' and backup_grant_id is null)
    or (performed_as = 'backup')
  )
);

create index if not exists pregnancy_procedures_pregnancy_idx
  on public.pregnancy_procedures (pregnancy_id, performed_at desc);
create index if not exists pregnancy_procedures_practice_idx
  on public.pregnancy_procedures (practice_id, created_at desc);
create index if not exists pregnancy_procedures_performer_idx
  on public.pregnancy_procedures (performed_by_professional_id);

comment on table public.pregnancy_procedures is
  'B2: ocorrência de procedimento clínico vinculado à gestação. Independente de política comercial (B1) e de repasse.';

create table if not exists public.pregnancy_procedure_payouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  pregnancy_id uuid not null references public.pregnancies (id) on delete restrict,
  pregnancy_procedure_id uuid not null references public.pregnancy_procedures (id) on delete restrict,
  principal_professional_id uuid not null references public.professionals (id),
  backup_professional_id uuid not null references public.professionals (id),
  amount_cents integer not null check (amount_cents >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'settled', 'cancelled')),
  effective_on date,
  notes text,
  cancel_reason text,
  created_by uuid not null references public.profiles (id),
  updated_by uuid references public.profiles (id),
  settled_at timestamptz,
  settled_by uuid references public.profiles (id),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pregnancy_procedure_payouts_notes_len check (notes is null or char_length(notes) <= 4000),
  constraint pregnancy_procedure_payouts_cancel_reason_len check (
    cancel_reason is null or char_length(cancel_reason) <= 2000
  ),
  constraint pregnancy_procedure_payouts_parties_distinct check (
    principal_professional_id <> backup_professional_id
  ),
  constraint pregnancy_procedure_payouts_settled_fields check (
    (status = 'settled' and settled_at is not null and effective_on is not null)
    or (status <> 'settled')
  ),
  constraint pregnancy_procedure_payouts_cancelled_fields check (
    (status = 'cancelled' and cancelled_at is not null)
    or (status <> 'cancelled')
  )
);

-- Um único repasse ativo (pending|settled) por procedimento. Cancelados liberam novo.
create unique index if not exists pregnancy_procedure_payouts_one_active_uidx
  on public.pregnancy_procedure_payouts (pregnancy_procedure_id)
  where status in ('pending', 'settled');

create index if not exists pregnancy_procedure_payouts_pregnancy_idx
  on public.pregnancy_procedure_payouts (pregnancy_id, status, created_at desc);
create index if not exists pregnancy_procedure_payouts_principal_idx
  on public.pregnancy_procedure_payouts (principal_professional_id, status, created_at desc);
create index if not exists pregnancy_procedure_payouts_backup_idx
  on public.pregnancy_procedure_payouts (backup_professional_id, status, created_at desc);
create index if not exists pregnancy_procedure_payouts_status_idx
  on public.pregnancy_procedure_payouts (practice_id, status, created_at desc);

comment on table public.pregnancy_procedure_payouts is
  'B2: repasse opcional principal → retaguarda. Distinto do valor contratado da política B1. amount_cents inteiro.';

create table if not exists public.pregnancy_procedure_payout_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  payout_id uuid not null references public.pregnancy_procedure_payouts (id) on delete restrict,
  kind text not null
    check (kind in (
      'created',
      'notes_updated',
      'amount_updated',
      'settled',
      'cancelled',
      'effective_on_updated'
    )),
  actor_id uuid references public.profiles (id),
  before_status text,
  after_status text,
  before_amount_cents integer,
  after_amount_cents integer,
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists pregnancy_procedure_payout_events_payout_idx
  on public.pregnancy_procedure_payout_events (payout_id, occurred_at desc);

comment on table public.pregnancy_procedure_payout_events is
  'B2: histórico de domínio do repasse. Não apagar.';

create table if not exists public.professional_payout_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  payout_id uuid not null references public.pregnancy_procedure_payouts (id) on delete restrict,
  professional_id uuid not null references public.professionals (id),
  counterparty_professional_id uuid not null references public.professionals (id),
  direction text not null check (direction in ('outflow', 'inflow')),
  effect text not null check (effect in ('post', 'reverse')),
  amount_cents integer not null check (amount_cents >= 0),
  entry_at timestamptz not null default now(),
  created_by uuid not null references public.profiles (id),
  note text,
  constraint professional_payout_ledger_parties_distinct check (
    professional_id <> counterparty_professional_id
  )
);

-- Evita dupla contabilização do mesmo efeito por direção
create unique index if not exists professional_payout_ledger_unique_effect_uidx
  on public.professional_payout_ledger_entries (payout_id, professional_id, direction, effect);

create index if not exists professional_payout_ledger_professional_idx
  on public.professional_payout_ledger_entries (professional_id, entry_at desc);
create index if not exists professional_payout_ledger_payout_idx
  on public.professional_payout_ledger_entries (payout_id, entry_at);

comment on table public.professional_payout_ledger_entries is
  'B2: ledger próprio do repasse entre médicas. Não mistura com invoices/payments nem política B1.';

-- ---------------------------------------------------------------------------
-- Helpers de autorização (financeiros ≠ clínicos)
-- ---------------------------------------------------------------------------

create or replace function public.can_read_pregnancy_procedure(
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
  -- Mesmo critério clínico da gestação (inclui secretária operacional).
  select public.can_access_pregnancy(p_pregnancy, p_practice, p_patient, p_primary)
$$;

comment on function public.can_read_pregnancy_procedure(uuid, uuid, uuid, uuid) is
  'B2 SELECT procedimento: segue can_access_pregnancy. NÃO concede leitura de repasse.';

create or replace function public.can_create_pregnancy_procedure(
  p_pregnancy uuid,
  p_practice uuid,
  p_primary uuid,
  p_performed_by uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_backup uuid;
  v_has_grant boolean;
begin
  select p.backup_professional_id
  into v_backup
  from public.pregnancies p
  where p.id = p_pregnancy
    and p.practice_id = p_practice;

  if not found then
    return false;
  end if;

  -- Principal registra para si ou para retaguarda cadastrada
  if public.is_pregnancy_principal(p_primary) then
    if p_performed_by = p_primary then
      return true;
    end if;
    if v_backup is not null and p_performed_by = v_backup then
      return true;
    end if;
    return false;
  end if;

  -- Retaguarda com grant ativo só registra procedimento próprio
  select public.has_active_pregnancy_backup_grant(p_pregnancy) into v_has_grant;
  if v_has_grant
     and public.is_professional_self(p_performed_by)
     and v_backup is not null
     and p_performed_by = v_backup then
    return true;
  end if;

  return false;
end;
$$;

comment on function public.can_create_pregnancy_procedure(uuid, uuid, uuid, uuid) is
  'B2 INSERT procedimento: principal (si ou retaguarda cadastrada) ou retaguarda com grant (somente si).';

create or replace function public.can_read_pregnancy_procedure_payout(
  p_practice uuid,
  p_principal uuid,
  p_backup uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Owner/admin: consulta. Principal e retaguarda envolvida: leitura.
  -- Secretária NUNCA, mesmo com can_view_care_policies.
  select
    public.has_practice_role(
      p_practice,
      array['owner', 'admin']::public.app_role[]
    )
    or public.is_professional_self(p_principal)
    or public.is_professional_self(p_backup)
$$;

comment on function public.can_read_pregnancy_procedure_payout(uuid, uuid, uuid) is
  'B2 SELECT repasse: owner/admin consulta; principal; retaguarda envolvida. Exclui secretária e flag B1.';

create or replace function public.can_manage_pregnancy_procedure_payout(
  p_practice uuid,
  p_principal uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Somente a médica principal. Owner/admin NÃO gerem.
  select
    public.is_professional_self(p_principal)
    and public.has_practice_role(
      p_practice,
      array['physician']::public.app_role[]
    )
$$;

comment on function public.can_manage_pregnancy_procedure_payout(uuid, uuid) is
  'B2 mutação financeira do repasse (criar/efetivar/cancelar/valor): somente médica principal.';

create or replace function public.can_edit_payout_notes(
  p_practice uuid,
  p_principal uuid,
  p_backup uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.can_manage_pregnancy_procedure_payout(p_practice, p_principal)
    or (
      public.is_professional_self(p_backup)
      and public.has_practice_role(
        p_practice,
        array['physician']::public.app_role[]
      )
    )
$$;

comment on function public.can_edit_payout_notes(uuid, uuid, uuid) is
  'B2: principal ou retaguarda envolvida podem editar somente notes (D1-B).';

-- ---------------------------------------------------------------------------
-- Evento + ledger helpers
-- ---------------------------------------------------------------------------

create or replace function public.append_pregnancy_procedure_payout_event(
  p_payout uuid,
  p_kind text,
  p_before_status text,
  p_after_status text,
  p_before_amount integer,
  p_after_amount integer,
  p_detail jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_practice uuid;
begin
  select organization_id, practice_id
  into v_org, v_practice
  from public.pregnancy_procedure_payouts
  where id = p_payout;

  if v_org is null then
    raise exception 'PAYOUT_NOT_FOUND';
  end if;

  insert into public.pregnancy_procedure_payout_events (
    organization_id,
    practice_id,
    payout_id,
    kind,
    actor_id,
    before_status,
    after_status,
    before_amount_cents,
    after_amount_cents,
    detail
  ) values (
    v_org,
    v_practice,
    p_payout,
    p_kind,
    auth.uid(),
    p_before_status,
    p_after_status,
    p_before_amount,
    p_after_amount,
    coalesce(p_detail, '{}'::jsonb)
  );
end;
$$;

create or replace function public.post_payout_ledger(
  p_payout uuid,
  p_effect text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.pregnancy_procedure_payouts%rowtype;
begin
  if p_effect not in ('post', 'reverse') then
    raise exception 'INVALID_LEDGER_EFFECT';
  end if;

  select * into r
  from public.pregnancy_procedure_payouts
  where id = p_payout
  for update;

  if not found then
    raise exception 'PAYOUT_NOT_FOUND';
  end if;

  -- Saída da principal
  insert into public.professional_payout_ledger_entries (
    organization_id,
    practice_id,
    payout_id,
    professional_id,
    counterparty_professional_id,
    direction,
    effect,
    amount_cents,
    created_by,
    note
  ) values (
    r.organization_id,
    r.practice_id,
    r.id,
    r.principal_professional_id,
    r.backup_professional_id,
    'outflow',
    p_effect,
    r.amount_cents,
    auth.uid(),
    p_note
  );

  -- Entrada da retaguarda
  insert into public.professional_payout_ledger_entries (
    organization_id,
    practice_id,
    payout_id,
    professional_id,
    counterparty_professional_id,
    direction,
    effect,
    amount_cents,
    created_by,
    note
  ) values (
    r.organization_id,
    r.practice_id,
    r.id,
    r.backup_professional_id,
    r.principal_professional_id,
    'inflow',
    p_effect,
    r.amount_cents,
    auth.uid(),
    p_note
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create or replace function public.create_pregnancy_procedure(
  p_pregnancy_id uuid,
  p_procedure_code text,
  p_performed_by_professional_id uuid,
  p_performed_at date,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  preg public.pregnancies%rowtype;
  proc public.procedures%rowtype;
  v_as text;
  v_grant uuid;
  v_id uuid;
  v_notes text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into preg
  from public.pregnancies
  where id = p_pregnancy_id
  for share;

  if not found then
    raise exception 'PREGNANCY_NOT_FOUND';
  end if;

  if not public.can_create_pregnancy_procedure(
    preg.id,
    preg.practice_id,
    preg.primary_professional_id,
    p_performed_by_professional_id
  ) then
    raise exception 'FORBIDDEN';
  end if;

  select * into proc
  from public.procedures
  where organization_id = preg.organization_id
    and code = p_procedure_code;

  if not found then
    raise exception 'PROCEDURE_CODE_UNKNOWN';
  end if;

  if p_performed_by_professional_id = preg.primary_professional_id then
    v_as := 'principal';
    v_grant := null;
  elsif preg.backup_professional_id is not null
        and p_performed_by_professional_id = preg.backup_professional_id then
    v_as := 'backup';
    -- Autorização vigente no momento da criação (D6-A: snapshot; revogação posterior não apaga)
    select g.id into v_grant
    from public.pregnancy_backup_grants g
    where g.pregnancy_id = preg.id
      and g.backup_professional_id = p_performed_by_professional_id
      and g.revoked_at is null
    order by g.granted_at desc
    limit 1;

    -- Principal pode registrar retaguarda se ela está cadastrada; preferir grant ativo.
    -- Se não há grant ativo e o ator NÃO é a principal, bloquear.
    if v_grant is null and not public.is_pregnancy_principal(preg.primary_professional_id) then
      raise exception 'BACKUP_GRANT_REQUIRED';
    end if;
  else
    raise exception 'PERFORMER_NOT_ALLOWED';
  end if;

  v_notes := nullif(btrim(coalesce(p_notes, '')), '');

  insert into public.pregnancy_procedures (
    organization_id,
    practice_id,
    pregnancy_id,
    procedure_id,
    procedure_code,
    performed_by_professional_id,
    performed_as,
    backup_grant_id,
    performed_at,
    notes,
    created_by,
    updated_by
  ) values (
    preg.organization_id,
    preg.practice_id,
    preg.id,
    proc.id,
    proc.code,
    p_performed_by_professional_id,
    v_as,
    v_grant,
    p_performed_at,
    v_notes,
    auth.uid(),
    auth.uid()
  )
  returning id into v_id;

  perform public.write_audit(
    'insert'::public.audit_action,
    'pregnancy_procedure',
    v_id,
    preg.practice_id,
    preg.patient_id,
    jsonb_build_object(
      'pregnancy_id', preg.id,
      'procedure_code', proc.code,
      'performed_as', v_as,
      'performed_by', p_performed_by_professional_id
    )
  );

  return v_id;
end;
$$;

revoke all on function public.create_pregnancy_procedure(uuid, text, uuid, date, text) from public;
grant execute on function public.create_pregnancy_procedure(uuid, text, uuid, date, text) to authenticated;

create or replace function public.create_pregnancy_procedure_payout(
  p_pregnancy_procedure_id uuid,
  p_amount_cents integer,
  p_notes text default null,
  p_effective_on date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  pp public.pregnancy_procedures%rowtype;
  preg public.pregnancies%rowtype;
  v_notes text;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_amount_cents is null or p_amount_cents < 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  select * into pp
  from public.pregnancy_procedures
  where id = p_pregnancy_procedure_id
  for update;

  if not found then
    raise exception 'PROCEDURE_NOT_FOUND';
  end if;

  select * into preg
  from public.pregnancies
  where id = pp.pregnancy_id;

  if not public.can_manage_pregnancy_procedure_payout(
    pp.practice_id,
    preg.primary_professional_id
  ) then
    raise exception 'FORBIDDEN';
  end if;

  -- D5-A: procedimento da principal não recebe repasse
  if pp.performed_as = 'principal'
     or pp.performed_by_professional_id = preg.primary_professional_id then
    raise exception 'PAYOUT_NOT_ALLOWED_FOR_PRINCIPAL_PROCEDURE';
  end if;

  if preg.backup_professional_id is null
     or pp.performed_by_professional_id <> preg.backup_professional_id then
    raise exception 'BACKUP_MISMATCH';
  end if;

  v_notes := nullif(btrim(coalesce(p_notes, '')), '');

  insert into public.pregnancy_procedure_payouts (
    organization_id,
    practice_id,
    pregnancy_id,
    pregnancy_procedure_id,
    principal_professional_id,
    backup_professional_id,
    amount_cents,
    status,
    effective_on,
    notes,
    created_by,
    updated_by
  ) values (
    pp.organization_id,
    pp.practice_id,
    pp.pregnancy_id,
    pp.id,
    preg.primary_professional_id,
    pp.performed_by_professional_id,
    p_amount_cents,
    'pending',
    p_effective_on,
    v_notes,
    auth.uid(),
    auth.uid()
  )
  returning id into v_id;

  perform public.append_pregnancy_procedure_payout_event(
    v_id,
    'created',
    null,
    'pending',
    null,
    p_amount_cents,
    jsonb_build_object('effective_on', p_effective_on)
  );

  perform public.write_audit(
    'insert'::public.audit_action,
    'pregnancy_procedure_payout',
    v_id,
    pp.practice_id,
    null,
    jsonb_build_object(
      'pregnancy_procedure_id', pp.id,
      'amount_cents', p_amount_cents,
      'status', 'pending'
    )
  );

  return v_id;
exception
  when unique_violation then
    raise exception 'ACTIVE_PAYOUT_EXISTS';
end;
$$;

revoke all on function public.create_pregnancy_procedure_payout(uuid, integer, text, date) from public;
grant execute on function public.create_pregnancy_procedure_payout(uuid, integer, text, date) to authenticated;

create or replace function public.update_pregnancy_procedure_payout_notes(
  p_payout_id uuid,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.pregnancy_procedure_payouts%rowtype;
  v_notes text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into r
  from public.pregnancy_procedure_payouts
  where id = p_payout_id
  for update;

  if not found then
    raise exception 'PAYOUT_NOT_FOUND';
  end if;

  if r.status = 'cancelled' then
    raise exception 'PAYOUT_CANCELLED';
  end if;

  if not public.can_edit_payout_notes(
    r.practice_id,
    r.principal_professional_id,
    r.backup_professional_id
  ) then
    raise exception 'FORBIDDEN';
  end if;

  v_notes := nullif(btrim(coalesce(p_notes, '')), '');

  update public.pregnancy_procedure_payouts
  set notes = v_notes,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_payout_id;

  perform public.append_pregnancy_procedure_payout_event(
    p_payout_id,
    'notes_updated',
    r.status,
    r.status,
    r.amount_cents,
    r.amount_cents,
    jsonb_build_object('notes', v_notes)
  );

  perform public.write_audit(
    'update'::public.audit_action,
    'pregnancy_procedure_payout',
    p_payout_id,
    r.practice_id,
    null,
    jsonb_build_object('field', 'notes')
  );
end;
$$;

revoke all on function public.update_pregnancy_procedure_payout_notes(uuid, text) from public;
grant execute on function public.update_pregnancy_procedure_payout_notes(uuid, text) to authenticated;

create or replace function public.update_pregnancy_procedure_payout_amount(
  p_payout_id uuid,
  p_amount_cents integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.pregnancy_procedure_payouts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_amount_cents is null or p_amount_cents < 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  select * into r
  from public.pregnancy_procedure_payouts
  where id = p_payout_id
  for update;

  if not found then
    raise exception 'PAYOUT_NOT_FOUND';
  end if;

  if not public.can_manage_pregnancy_procedure_payout(
    r.practice_id,
    r.principal_professional_id
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if r.status <> 'pending' then
    raise exception 'AMOUNT_LOCKED';
  end if;

  update public.pregnancy_procedure_payouts
  set amount_cents = p_amount_cents,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_payout_id;

  perform public.append_pregnancy_procedure_payout_event(
    p_payout_id,
    'amount_updated',
    r.status,
    r.status,
    r.amount_cents,
    p_amount_cents,
    '{}'::jsonb
  );

  perform public.write_audit(
    'update'::public.audit_action,
    'pregnancy_procedure_payout',
    p_payout_id,
    r.practice_id,
    null,
    jsonb_build_object(
      'field', 'amount_cents',
      'before', r.amount_cents,
      'after', p_amount_cents
    )
  );
end;
$$;

revoke all on function public.update_pregnancy_procedure_payout_amount(uuid, integer) from public;
grant execute on function public.update_pregnancy_procedure_payout_amount(uuid, integer) to authenticated;

create or replace function public.settle_pregnancy_procedure_payout(
  p_payout_id uuid,
  p_effective_on date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.pregnancy_procedure_payouts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_effective_on is null then
    raise exception 'EFFECTIVE_ON_REQUIRED';
  end if;

  select * into r
  from public.pregnancy_procedure_payouts
  where id = p_payout_id
  for update;

  if not found then
    raise exception 'PAYOUT_NOT_FOUND';
  end if;

  if not public.can_manage_pregnancy_procedure_payout(
    r.practice_id,
    r.principal_professional_id
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if r.status <> 'pending' then
    raise exception 'INVALID_STATUS_TRANSITION';
  end if;

  update public.pregnancy_procedure_payouts
  set status = 'settled',
      effective_on = p_effective_on,
      settled_at = now(),
      settled_by = auth.uid(),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_payout_id;

  perform public.post_payout_ledger(p_payout_id, 'post', 'settlement');

  perform public.append_pregnancy_procedure_payout_event(
    p_payout_id,
    'settled',
    'pending',
    'settled',
    r.amount_cents,
    r.amount_cents,
    jsonb_build_object('effective_on', p_effective_on)
  );

  perform public.write_audit(
    'update'::public.audit_action,
    'pregnancy_procedure_payout',
    p_payout_id,
    r.practice_id,
    null,
    jsonb_build_object('status', 'settled', 'effective_on', p_effective_on)
  );
end;
$$;

revoke all on function public.settle_pregnancy_procedure_payout(uuid, date) from public;
grant execute on function public.settle_pregnancy_procedure_payout(uuid, date) to authenticated;

create or replace function public.cancel_pregnancy_procedure_payout(
  p_payout_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.pregnancy_procedure_payouts%rowtype;
  v_reason text;
  v_prev text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into r
  from public.pregnancy_procedure_payouts
  where id = p_payout_id
  for update;

  if not found then
    raise exception 'PAYOUT_NOT_FOUND';
  end if;

  if not public.can_manage_pregnancy_procedure_payout(
    r.practice_id,
    r.principal_professional_id
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if r.status = 'cancelled' then
    raise exception 'ALREADY_CANCELLED';
  end if;

  if r.status not in ('pending', 'settled') then
    raise exception 'INVALID_STATUS_TRANSITION';
  end if;

  v_prev := r.status;
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');

  if v_prev = 'settled' then
    perform public.post_payout_ledger(p_payout_id, 'reverse', 'cancellation');
  end if;

  update public.pregnancy_procedure_payouts
  set status = 'cancelled',
      cancel_reason = v_reason,
      cancelled_at = now(),
      cancelled_by = auth.uid(),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_payout_id;

  perform public.append_pregnancy_procedure_payout_event(
    p_payout_id,
    'cancelled',
    v_prev,
    'cancelled',
    r.amount_cents,
    r.amount_cents,
    jsonb_build_object('reason', v_reason, 'previous_status', v_prev)
  );

  perform public.write_audit(
    'update'::public.audit_action,
    'pregnancy_procedure_payout',
    p_payout_id,
    r.practice_id,
    null,
    jsonb_build_object('status', 'cancelled', 'previous_status', v_prev)
  );
end;
$$;

revoke all on function public.cancel_pregnancy_procedure_payout(uuid, text) from public;
grant execute on function public.cancel_pregnancy_procedure_payout(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.pregnancy_procedures enable row level security;
alter table public.pregnancy_procedure_payouts enable row level security;
alter table public.pregnancy_procedure_payout_events enable row level security;
alter table public.professional_payout_ledger_entries enable row level security;

drop policy if exists pregnancy_procedures_select on public.pregnancy_procedures;
create policy pregnancy_procedures_select
  on public.pregnancy_procedures
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.pregnancies p
      where p.id = pregnancy_procedures.pregnancy_id
        and public.can_read_pregnancy_procedure(
          p.id,
          p.practice_id,
          p.patient_id,
          p.primary_professional_id
        )
    )
  );

-- Mutações somente via RPC (security definer)
drop policy if exists pregnancy_procedures_insert on public.pregnancy_procedures;
drop policy if exists pregnancy_procedures_update on public.pregnancy_procedures;
drop policy if exists pregnancy_procedures_delete on public.pregnancy_procedures;

drop policy if exists pregnancy_procedure_payouts_select on public.pregnancy_procedure_payouts;
create policy pregnancy_procedure_payouts_select
  on public.pregnancy_procedure_payouts
  for select
  to authenticated
  using (
    public.can_read_pregnancy_procedure_payout(
      practice_id,
      principal_professional_id,
      backup_professional_id
    )
  );

drop policy if exists pregnancy_procedure_payouts_insert on public.pregnancy_procedure_payouts;
drop policy if exists pregnancy_procedure_payouts_update on public.pregnancy_procedure_payouts;
drop policy if exists pregnancy_procedure_payouts_delete on public.pregnancy_procedure_payouts;

drop policy if exists pregnancy_procedure_payout_events_select on public.pregnancy_procedure_payout_events;
create policy pregnancy_procedure_payout_events_select
  on public.pregnancy_procedure_payout_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.pregnancy_procedure_payouts po
      where po.id = pregnancy_procedure_payout_events.payout_id
        and public.can_read_pregnancy_procedure_payout(
          po.practice_id,
          po.principal_professional_id,
          po.backup_professional_id
        )
    )
  );

drop policy if exists pregnancy_procedure_payout_events_write on public.pregnancy_procedure_payout_events;

drop policy if exists professional_payout_ledger_select on public.professional_payout_ledger_entries;
create policy professional_payout_ledger_select
  on public.professional_payout_ledger_entries
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.pregnancy_procedure_payouts po
      where po.id = professional_payout_ledger_entries.payout_id
        and public.can_read_pregnancy_procedure_payout(
          po.practice_id,
          po.principal_professional_id,
          po.backup_professional_id
        )
    )
  );

drop policy if exists professional_payout_ledger_write on public.professional_payout_ledger_entries;

grant select on public.pregnancy_procedures to authenticated;
grant select on public.pregnancy_procedure_payouts to authenticated;
grant select on public.pregnancy_procedure_payout_events to authenticated;
grant select on public.professional_payout_ledger_entries to authenticated;
